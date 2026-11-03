import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  manualProofSubmissionError,
  assertAmountMatch,
  normaliseTransactionRef,
  assertManualProofContext,
  MAX_PROOF_SUBMISSIONS,
} from '../src/services/manualPayment.service';
import { paymentEligible } from '../src/services/dispatch.service';
import { manualPaymentReviewSchema } from '../src/validations/payment';
import {
  MANUAL_TRANSFER_METHODS,
  MANUAL_CHANNEL_BY_METHOD,
  ORDER_CHECKOUT_METHODS,
  PAYMENT_STATUSES,
  isGatewayPaymentMethod,
  isManualTransferMethod,
  manualChannelForMethod,
} from '../src/models';

/**
 * DIRECT BANK / WALLET TRANSFER (admin-verified) — unit rules.
 *
 * These cover exactly the failure modes the payment rules forbid:
 *   - a duplicate submission while verification is in progress
 *   - a submission past the attempt cap (spam/replay pressure)
 *   - a manipulated amount (customer-supplied totals are never accepted)
 *   - an approve/reject without the evidence/reason the workflow requires
 *   - an attempt to use the transfer endpoints on another customer's order
 *     (or on an order that was not placed with a direct-transfer method)
 */
describe('direct transfer method classification', () => {
  it('treats ubl/easypaisa_transfer/jazzcash_transfer as manual, never as gateways', () => {
    for (const method of MANUAL_TRANSFER_METHODS) {
      assert.equal(isManualTransferMethod(method), true, method);
      assert.equal(isGatewayPaymentMethod(method), false, method);
    }
  });

  it('keeps the real gateways out of the manual set', () => {
    for (const method of ['easypaisa', 'jazzcash', 'demo'] as const) {
      assert.equal(isManualTransferMethod(method), false, method);
      assert.equal(isGatewayPaymentMethod(method), true, method);
    }
  });

  it('maps every checkout method to its receiving account channel', () => {
    assert.equal(MANUAL_CHANNEL_BY_METHOD.ubl, 'ubl');
    assert.equal(MANUAL_CHANNEL_BY_METHOD.easypaisa_transfer, 'easypaisa');
    assert.equal(MANUAL_CHANNEL_BY_METHOD.jazzcash_transfer, 'jazzcash');
    assert.equal(manualChannelForMethod('ubl'), 'ubl');
    assert.equal(manualChannelForMethod('cash'), null);
  });

  it('offers manual methods at checkout and stores the new payment states', () => {
    for (const method of MANUAL_TRANSFER_METHODS) {
      assert.ok((ORDER_CHECKOUT_METHODS as readonly string[]).includes(method));
    }
    assert.ok((PAYMENT_STATUSES as readonly string[]).includes('pending_verification'));
    assert.ok((PAYMENT_STATUSES as readonly string[]).includes('rejected'));
  });
});

describe('manual proof submission gate', () => {
  it('allows a first submission from an untouched payment', () => {
    assert.equal(manualProofSubmissionError('pending', 0), null);
    assert.equal(manualProofSubmissionError('processing', 0), null);
  });

  it('blocks duplicate submissions while verification is in progress', () => {
    const error = manualProofSubmissionError('pending_verification', 1);
    assert.match(error ?? '', /already with the admin/i);
  });

  it('never re-opens a payment the admin already verified', () => {
    const error = manualProofSubmissionError('paid', 2);
    assert.match(error ?? '', /already been verified/i);
  });

  it('allows corrected proof after a rejection (bounded attempts)', () => {
    assert.equal(manualProofSubmissionError('rejected', 1), null);
    assert.equal(manualProofSubmissionError('failed', 2), null);
  });

  it('stops submissions once the attempt cap is exhausted', () => {
    assert.match(
      manualProofSubmissionError('rejected', MAX_PROOF_SUBMISSIONS) ?? '',
      /exhausted/i,
    );
    assert.match(manualProofSubmissionError('pending', MAX_PROOF_SUBMISSIONS) ?? '', /exhausted/i);
    assert.equal(manualProofSubmissionError('rejected', MAX_PROOF_SUBMISSIONS - 1), null);
  });

  it('blocks cancelled/refunded payments outright', () => {
    assert.match(manualProofSubmissionError('cancelled', 0) ?? '', /cancelled/);
    assert.match(manualProofSubmissionError('refunded', 0) ?? '', /refunded/);
  });
});

describe('amount verification (incorrect-amount protection)', () => {
  it('accepts the exact server-side order total only', () => {
    assert.equal(assertAmountMatch(1250, 1250), 1250);
  });

  it('rejects any mismatch, including fractional tampering', () => {
    assert.throws(() => assertAmountMatch(1250, 1200), /does not match the order total/);
    assert.throws(() => assertAmountMatch(1250, 1250.4), /amount is invalid/);
    assert.throws(() => assertAmountMatch(0, 0), /amount is invalid/);
    assert.throws(() => assertAmountMatch(-5, -5), /amount is invalid/);
    assert.throws(() => assertAmountMatch(Number.NaN, 10), /amount is invalid/);
  });
});

describe('transaction reference validation (replay/clippy protection)', () => {
  it('accepts a normal bank/wallet reference and normalises spacing', () => {
    assert.equal(normaliseTransactionRef('UBL-882931001'), 'UBL-882931001');
    assert.equal(normaliseTransactionRef('  EP 991833 ' ), 'EP-991833');
  });

  it('rejects empty, too-short and malformed references', () => {
    assert.throws(() => normaliseTransactionRef(''), /transaction\/reference/);
    assert.throws(() => normaliseTransactionRef('abc'), /transaction\/reference/);
    assert.throws(() => normaliseTransactionRef('<script>alert(1)</script>'), /invalid characters|transaction\/reference/);
    assert.throws(() => normaliseTransactionRef(null), /transaction\/reference/);
  });
});

describe('manual proof context guard (unauthorised access protection)', () => {
  const order = {
    _id: 'order-1',
    customer: 'customer-1',
    paymentMethod: 'ubl' as const,
    paymentStatus: 'pending' as const,
    total: 1000,
  };

  it('lets only the owning customer submit or read', () => {
    assert.doesNotThrow(() => assertManualProofContext(order, 'customer-1'));
    assert.throws(
      () => assertManualProofContext(order, 'customer-2'),
      (e: any) => e.statusCode === 403,
    );
  });

  it('refuses non-manual methods (gateway orders use the gateway paths)', () => {
    assert.throws(
      () => assertManualProofContext({ ...order, paymentMethod: 'easypaisa' as never }, 'customer-1'),
      (e: any) => e.statusCode === 400,
    );
  });
});

describe('admin verification decision payload', () => {
  const schema = manualPaymentReviewSchema;

  it('accepts an approve with or without an optional bank-statement note', () => {
    assert.equal(schema.safeParse({ decision: 'approve' }).success, true);
    assert.equal(
      schema.safeParse({ decision: 'approve', reason: 'Matched UBL credit #882931' }).success,
      true,
    );
  });

  it('requires a real reason to reject or request info', () => {
    assert.equal(schema.safeParse({ decision: 'reject' }).success, false);
    assert.equal(schema.safeParse({ decision: 'reject', reason: 'no' }).success, false);
    assert.equal(schema.safeParse({ decision: 'request_info' }).success, false);
    assert.equal(
      schema.safeParse({ decision: 'reject', reason: 'Amount on receipt does not match' }).success,
      true,
    );
  });

  it('refuses unknown decisions', () => {
    assert.equal(schema.safeParse({ decision: 'auto_approve', reason: 'attack' }).success, false);
  });
});

describe('payment eligibility gate (rider assignment + order confirmation)', () => {
  // `paymentEligible` only reads paymentStatus + paymentMethod, and both are
  // swappable here — the same rule now guards confirmations and rider
  // assignment, so the states a screenshot can produce are locked in.
  const gate = (paymentStatus: string, paymentMethod: string) =>
    paymentEligible({ paymentStatus, paymentMethod } as never);

  it('opens for admin-verified / settled payments', () => {
    assert.equal(gate('paid', 'ubl'), true);
    assert.equal(gate('paid', 'easypaisa'), true);
    assert.equal(gate('paid', 'demo'), true);
  });

  it('opens for cash on delivery (settles at the door)', () => {
    assert.equal(gate('pending', 'cash'), true);
  });

  it('never opens for a screenshot still awaiting verification', () => {
    assert.equal(gate('pending_verification', 'ubl'), false);
    assert.equal(gate('pending_verification', 'easypaisa_transfer'), false);
    assert.equal(gate('pending_verification', 'jazzcash_transfer'), false);
  });

  it('never opens for rejected/failed proof or an unsettled gateway payment', () => {
    assert.equal(gate('rejected', 'ubl'), false);
    assert.equal(gate('failed', 'ubl'), false);
    assert.equal(gate('cancelled', 'ubl'), false);
    assert.equal(gate('processing', 'easypaisa'), false);
    assert.equal(gate('pending', 'easypaisa_transfer'), false);
  });
});
