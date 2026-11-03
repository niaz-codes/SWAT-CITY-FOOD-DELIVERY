import {
  OrderModel,
  PaymentModel,
  PaymentVerificationModel,
  UserModel,
  isManualTransferMethod,
  type Order,
  type Payment,
} from '../models';
import { AppError, BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { notifyUser } from './notification.service';
import { assertAmountMatch, receiptSignedUrl } from './manualPayment.service';

/**
 * ADMIN VERIFICATION of direct bank/wallet transfer payments.
 *
 * The ONLY way a manual-transfer payment becomes `paid` is a decision made
 * here, by an authorised admin, after comparing the submitted reference/receipt
 * with the actual money in the company account (UBL statement / mobile-wallet
 * activity). A customer screenshot, transaction id or resubmission can never
 * reach `paid` by itself.
 *
 * Every decision is compare-and-set on the payment status (double-click safe),
 * amount-checked against the server-side order total, and recorded in the
 * `payment_verifications` audit table with the admin id, timestamp, decision
 * and reason — the log is append-only code-wise: nothing edits or deletes rows.
 */
export type ReviewDecision = 'approve' | 'reject' | 'request_info';

/** Actions the admin may take + input requirements for each. */
export const REVIEW_DECISIONS: Record<ReviewDecision, { requiresReason: boolean }> = {
  approve: { requiresReason: false },
  reject: { requiresReason: true },
  request_info: { requiresReason: true },
};

export interface ManualPaymentReviewView {
  payment: {
    id: string;
    method: string;
    channel: string | null;
    status: string;
    amount: number;
    currency: string;
    transactionRef?: string | null;
    submittedAt?: string | null;
    receiptUrl?: string | null;
    failureReason?: string | null;
    verifyAttempts: number;
    submitCount: number;
    metadata?: Record<string, unknown>;
  };
  order: {
    id: string;
    orderNumber?: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    createdAt: string;
  };
  customer: { id: string; name: string; phone: string };
  audit: Array<{
    id: string;
    decision: string;
    actor: string;
    actorRole: string;
    reason?: string | null;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isManualGateway(payment: Payment): boolean {
  return isManualTransferMethod(payment.method) && String(payment.gateway) === 'manual';
}
export async function manualPaymentDetail(
  paymentId: string,
): Promise<ManualPaymentReviewView | null> {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment || !isManualGateway(payment)) return null;

  const order = payment.order ? await OrderModel.findById(String(payment.order)) : null;
  if (!order) return null;

  const audit = await PaymentVerificationModel.find({ payment: String(payment._id) })
    .sort({ createdAt: 1 })
    .lean();

  const customer = await customerOf(order);
  const receiptUrl = await receiptSignedUrl(payment).catch(() => null);
  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;

  return {
    payment: {
      id: String(payment._id),
      method: String(payment.method),
      channel: metadata.channel ? String(metadata.channel) : null,
      status: String(payment.status),
      amount: payment.amount,
      currency: payment.currency ?? 'PKR',
      transactionRef: payment.transactionRef ?? null,
      submittedAt: typeof metadata.submittedAt === 'string' ? metadata.submittedAt : null,
      receiptUrl,
      failureReason: payment.failureReason ?? null,
      verifyAttempts: payment.verifyAttempts ?? 0,
      submitCount: Number(metadata.resubmitCount ?? 0) + 1,
      metadata,
    },
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      status: String(order.status),
      paymentStatus: String(order.paymentStatus),
      total: order.total,
      createdAt: new Date(order.createdAt).toISOString(),
    },
    customer,
    audit: audit.map((row) => ({
      id: String(row._id),
      decision: String(row.decision),
      actor: String(row.actor),
      actorRole: String(row.actorRole),
      reason: row.reason ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  };
}

/** Admin queue rows: manual-transfer payment + its order + customer, paged. */
export async function listManualPayments(options: {
  status?: string;
  page: number;
  limit: number;
}): Promise<{ rows: unknown[]; total: number }> {
  const query: Record<string, unknown> = { gateway: 'manual' };
  if (options.status && options.status !== 'all') {
    query.status = options.status;
  } else if (options.status === 'all') {
    // Explicit "All": every manual payment, decided or not.
  } else {
    // Default queue = what the admin can still act on, most recently touched first.
    query.status = { $in: ['pending_verification', 'pending', 'processing'] };
  }
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const [rows, total] = await Promise.all([
    PaymentModel.find(query)
      .populate('user', 'name phone')
      .populate('order', 'orderNumber total paymentStatus status')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PaymentModel.countDocuments(query),
  ]);
  return { rows, total };
}

/**
 * The admin's verdict. This is the ONLY code path that can move a manual
 * payment to `paid`.
 */
export async function reviewManualPayment(input: {
  paymentId: string;
  adminId: string;
  decision: ReviewDecision;
  reason?: string;
}): Promise<{ payment: Payment; order: Order }> {
  const { decision, reason } = input;
  if (!REVIEW_DECISIONS[decision]) throw BAD_REQUEST('Unknown verification decision');

  const trimmedReason = String(reason ?? '').trim();
  if (REVIEW_DECISIONS[decision].requiresReason && trimmedReason.length < 4) {
    throw BAD_REQUEST('A clear reason is required for this decision');
  }

  const payment = await PaymentModel.findById(input.paymentId);
  if (!payment) throw NOT_FOUND('Payment');
  if (!isManualGateway(payment)) {
    throw BAD_REQUEST('Only direct bank/wallet transfer payments are verified here');
  }

  const order = payment.order ? await OrderModel.findById(String(payment.order)) : null;
  if (!order) throw NOT_FOUND('Order');
  // The reviewed amount must always be the server-side total, exactly as the
  // instructions showed the customer — with no tolerance.
  assertAmountMatch(Number(order.total), payment.amount);

  const now = new Date();

  if (decision === 'approve') {
    // The receipt artefact is REQUIRED for an approval: "verified" means the
    // admin checked evidence, and there is no evidence without it.
    const receiptPath = (payment.metadata as any)?.receiptPath;
    if (!receiptPath) {
      throw BAD_REQUEST('This payment has no receipt on file and cannot be approved');
    }

    // CAS: only a payment still waiting for verification can be approved, so a
    // raced double-tap or a replayed decision is a conflict, not a second settle.
    const approved = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, status: 'pending_verification' },
      {
        $set: {
          status: 'paid',
          paidAt: now,
          verifiedAt: now,
          verifyAttempts: (payment.verifyAttempts ?? 0) + 1,
          failureReason: null,
          gatewayResponseCode: 'ADMIN_VERIFIED',
        },
      },
      { new: true },
    );
    if (!approved) {
      const current = await PaymentModel.findById(String(payment._id));
      if (current && String(current.status) === 'paid') {
        // Idempotent replay of an already-made decision: return the settled pair.
        return { payment: current, order };
      }
      throw CONFLICT('Payment state changed. Refresh and try again.');
    }

    const wasPaid = String(order.paymentStatus) === 'paid';
    order.paymentStatus = 'paid';
    order.paymentVerifiedAt = now;
    order.paymentFailureReason = null;
    if (!order.paymentTransactionRef) order.paymentTransactionRef = payment.transactionRef ?? null;
    order.statusHistory.push({
      status: String(order.status),
      note: `Payment verified by admin ${input.adminId} — reference ${payment.transactionRef ?? ''}`.trim(),
    });
    await order.save();

    await writeAudit({
      payment: String(payment._id),
      order: String(order._id),
      adminId: input.adminId,
      decision: 'approve',
      reason: trimmedReason || null,
      amount: payment.amount,
      transactionRef: payment.transactionRef ?? null,
    });

    if (!wasPaid) {
      await notifyUser(String(order.customer), {
        type: 'order',
        event: 'order_placed',
        refId: String(order._id),
        title: 'Payment verified',
        body: `Your payment for order ${order.orderNumber} was verified. The restaurant can now accept your order.`,
        data: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          paymentStatus: 'paid',
        },
      });
    }

    const freshPayment = (await PaymentModel.findById(String(payment._id))) as Payment;
    return { payment: freshPayment, order };
  }

  if (decision === 'reject') {
    const rejected = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, status: 'pending_verification' },
      {
        $set: {
          status: 'rejected',
          failedAt: now,
          verifiedAt: now,
          verifyAttempts: (payment.verifyAttempts ?? 0) + 1,
          failureReason: trimmedReason,
        },
      },
      { new: true },
    );
    if (!rejected) throw CONFLICT('Payment state changed. Refresh and try again.');

    const wasRejected = String(order.paymentStatus) === 'rejected';
    order.paymentStatus = 'rejected';
    order.paymentFailureReason = trimmedReason;
    order.statusHistory.push({
      status: String(order.status),
      note: `Payment proof rejected by admin ${input.adminId}: ${trimmedReason}`.slice(0, 300),
    });
    await order.save();

    await writeAudit({
      payment: String(payment._id),
      order: String(order._id),
      adminId: input.adminId,
      decision: 'reject',
      reason: trimmedReason,
      amount: payment.amount,
      transactionRef: payment.transactionRef ?? null,
    });

    if (!wasRejected) {
      await notifyUser(String(order.customer), {
        type: 'order',
        event: 'order_placed',
        refId: String(order._id),
        title: 'Payment could not be verified',
        body: `Your payment for order ${order.orderNumber} did not match the bank record: ${trimmedReason}. Your order stays unconfirmed — you can submit corrected proof.`,
        data: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          paymentStatus: 'rejected',
        },
      });
    }

    const freshPayment = (await PaymentModel.findById(String(payment._id))) as Payment;
    return { payment: freshPayment, order };
  }

  // request_info: the admin asks for a clearer receipt / better details and
  // the customer must be able to resubmit. The payment is therefore moved OUT
  // of `pending_verification` into `rejected` — the one openable state in the
  // submission gate (`manualProofSubmissionError` allows proof again after a
  // rejection). Leaving it "awaiting verification" here would trip the
  // duplicate-submission guard and make resubmission impossible: the customer
  // would be told to resubmit while every upload lands a 409. The audit trail
  // below keeps the decision itself as `request_info`, so history still
  // separates "needs a clearer receipt" from a hard rejection.
  const reopened = await PaymentModel.findOneAndUpdate(
    { _id: payment._id, status: 'pending_verification' },
    {
      $set: {
        status: 'rejected',
        failedAt: now,
        verifiedAt: now,
        verifyAttempts: (payment.verifyAttempts ?? 0) + 1,
        failureReason: trimmedReason,
      },
    },
    { new: true },
  );
  if (!reopened) throw CONFLICT('Payment state changed. Refresh and try again.');

  order.paymentStatus = 'rejected';
  order.paymentFailureReason = trimmedReason;
  order.statusHistory.push({
    status: String(order.status),
    note: `Admin requested corrected payment proof: ${trimmedReason}`.slice(0, 300),
  });
  await order.save();

  await writeAudit({
    payment: String(payment._id),
    order: String(order._id),
    adminId: input.adminId,
    decision: 'request_info',
    reason: trimmedReason,
    amount: payment.amount,
    transactionRef: payment.transactionRef ?? null,
  });

  await notifyUser(String(order.customer), {
    type: 'order',
    event: 'order_placed',
    refId: String(order._id),
    title: 'More information needed',
    body: `Your payment proof for order ${order.orderNumber} needs a clearer receipt or more details: ${trimmedReason}. Please submit a corrected proof.`,
    data: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      paymentStatus: 'rejected',
      needsInfo: true,
    },
  });

  return { payment: reopened, order };
}

async function writeAudit(row: {
  payment: string;
  order: string;
  adminId: string;
  decision: ReviewDecision;
  reason: string | null;
  amount: number;
  transactionRef: string | null;
}): Promise<void> {
  await PaymentVerificationModel.create({
    payment: row.payment,
    order: row.order,
    actor: row.adminId,
    actorRole: 'admin',
    decision: row.decision,
    reason: row.reason,
    amount: row.amount,
    transactionRef: row.transactionRef,
  }).catch(() => undefined);
}

async function customerOf(order: Order): Promise<{ id: string; name: string; phone: string }> {
  const user = order.customer
    ? await UserModel.findById(String(order.customer)).select('name phone').lean()
    : null;
  return {
    id: String(order.customer ?? ''),
    name: String((user as any)?.name ?? 'Customer'),
    phone: String((user as any)?.phone ?? ''),
  };
}
