import { env } from '../config/env';
import {
  MANUAL_TRANSFER_METHODS,
  OrderModel,
  PaymentModel,
  PaymentVerificationModel,
  UserModel,
  manualChannelForMethod,
  type ManualTransferChannel,
  type ManualTransferMethod,
  type Order,
  type Payment,
} from '../models';
import { AppError, BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { notifyUser } from './notification.service';
import { createSignedUrl, ensureBucket, uploadBuffer } from './storage.service';
import { channelLabel, getPaymentMethodConfig, transfersEnabled } from './paymentSettings.service';

/**
 * DIRECT BANK / WALLET TRANSFER (manual, admin-verified).
 *
 * This service owns two things:
 *  1. The receiving-account instructions the customer sees for THEIR order only
 *     (UBL bank account, or the company Easypaisa / JazzCash mobile numbers).
 *     The details come from server-side configuration and are never bundled
 *     into a public client asset.
 *  2. Submission of the customer's transfer proof (transaction reference +
 *     receipt screenshot). Submitting sets the payment to
 *     `pending_verification` — it NEVER marks money as received, never
 *     confirms the order and never assigns a rider. Only an authorised admin,
 *     comparing the submission with the real UBL statement, can verify.
 *
 * There is deliberately NO bank API and NO automatic verification here: in this
 * project "manual transfer" means a human bank teller / wallet transfer, and
 * nothing in this file treats an uploaded screenshot as money.
 */

/** Receiving accounts surfaced to the customer, straight from server config. */
export interface TransferAccount {
  channel: ManualTransferChannel;
  /** Checkout method key this account backs. */
  method: ManualTransferMethod;
  label: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string;
  branch?: string;
  instructions: string;
}

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/]{3,60}$/;

/** How many times a customer may (re)submit proof for one payment row. */
export const MAX_PROOF_SUBMISSIONS = 5;

/**
 * Pure submission gate. Returns the client-facing error message when the
 * current payment state must NOT accept another proof submission, or null when
 * it may. Used both by the route handler and by the unit tests.
 *
 * Rules:
 *  - `paid` → the payment is already verified; another submission changes nothing.
 *  - `pending_verification` → duplicate: proof is already waiting for an admin.
 *  - `pending` / `processing` / `rejected` / `failed` → a submission is allowed
 *    (rejected/failed = the admin asked for corrected proof; the SAME payment
 *    row is recycled so history and the reference stay in one place).
 *  - anywhere past the attempt cap → blocked, so a tampering client cannot
 *    spam the verification queue.
 */
export function manualProofSubmissionError(
  status: string,
  verifyAttempts: number,
): string | null {
  if (status === 'paid') {
    return 'This payment has already been verified. No further proof is needed.';
  }
  if (status === 'pending_verification') {
    return 'Your payment proof is already with the admin for verification. Please wait for their decision.';
  }
  if (status === 'cancelled' || status === 'refunded') {
    return `This payment is ${status} and cannot accept new proof.`;
  }
  if (verifyAttempts >= MAX_PROOF_SUBMISSIONS) {
    return 'Proof submissions for this order are exhausted. Please contact support on WhatsApp.';
  }
  return null;
}

/**
 * Pure amount gate. The customer NEVER supplies a transfer amount — the amount
 * the admin verifies against is always `payment.amount`, written by the server
 * at checkout. This guard exists so a tampered/stored mismatch can never be
 * quietly approved: instructions, submission and admin review all read the same
 * values.
 */
export function assertAmountMatch(orderTotal: number, paymentAmount: number): number {
  const total = Number(orderTotal ?? 0);
  const recorded = Number(paymentAmount ?? 0);
  // Whole rupees only: a fractional value means a tampered or corrupted row.
  if (!Number.isFinite(total) || !Number.isFinite(recorded) || total <= 0) {
    throw new AppError('The order amount is invalid', 422);
  }
  if (!Number.isInteger(total) || !Number.isInteger(recorded)) {
    throw new AppError('The order amount is invalid', 422);
  }
  if (total !== recorded) {
    throw new AppError(
      'The recorded payment amount does not match the order total. Please contact support instead of paying this order.',
      409,
    );
  }
  return total;
}

/** Server-side transaction-reference normalisation + validation. */
export function normaliseTransactionRef(raw: unknown): string {
  const ref = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '-');
  if (!REF_PATTERN.test(ref)) {
    throw BAD_REQUEST(
      'Enter the transaction/reference ID from your transfer receipt (4–60 characters).',
    );
  }
  return ref;
}

type OrderLike = Pick<
  Order,
  'customer' | 'paymentMethod' | 'paymentStatus' | 'total'
> & {
  _id: unknown;
  orderNumber?: string | null;
  payment?: string | null;
};

/**
 * Pure context guard for every manual-transfer endpoint: only the order's own
 * customer may read its transfer instructions or submit proof, and only
 * manual-transfer orders may use these endpoints at all.
 */
export function assertManualProofContext(order: OrderLike, userId: string): void {
  if (String(order.customer) !== String(userId)) {
    throw new AppError('You can only manage your own orders', 403);
  }
  if (!manualChannelForMethod(order.paymentMethod)) {
    throw new AppError('This order was not placed with a direct transfer method', 400);
  }
}

/** Default how-to text per channel (used until the admin writes their own copy). */
const CHANNEL_INSTRUCTIONS: Record<ManualTransferChannel, string> = {
  ubl:
    'Open your banking app and transfer the exact order total to this account, then come back and submit the transaction ID + receipt screenshot. Your order is confirmed only after an admin verifies the transfer against the bank statement.',
  easypaisa:
    'Send the exact order total from your own Easypaisa app (or an Easypaisa agent) to this number, then submit the transaction ID + receipt screenshot here. A screenshot alone is not payment — an admin confirms it against the account activity first.',
  jazzcash:
    'Send the exact order total from your own JazzCash app (or a JazzCash agent) to this number, then submit the transaction ID + receipt screenshot here. A screenshot alone is not payment — an admin confirms it against the account activity first.',
};

/**
 * Receiving account for one checkout method, straight from the database-backed
 * settings (admin-saved values win, ENV defaults fill unconfigured channels).
 *
 * `evenIfDisabled`: instructions for an order ALREADY placed with this method
 * must keep rendering even if the admin disables the channel mid-flight — the
 * customer still has to move money for their existing order. New orders are
 * gated separately (the method list and checkout validation), so disabling a
 * channel only stops fresh orders, never strands a pending one.
 */
export async function accountForMethod(
  method: string,
  opts: { evenIfDisabled?: boolean } = {},
): Promise<TransferAccount | null> {
  const channel = manualChannelForMethod(method);
  if (!channel) return null;
  if (!(await transfersEnabled())) return null;

  const { config } = await getPaymentMethodConfig(channel);
  if (!config.enabled && !opts.evenIfDisabled) return null;

  return {
    channel,
    method: method as ManualTransferMethod,
    label: channelLabel(channel),
    bankName: config.bankName,
    accountTitle: config.accountTitle,
    accountNumber: config.accountNumber,
    ...(config.iban ? { iban: config.iban } : {}),
    ...(config.branch ? { branch: config.branch } : {}),
    instructions: CHANNEL_INSTRUCTIONS[channel],
  };
}

/** The methods customers may currently pick at checkout (ENABLED only). */
export async function transferAccounts(): Promise<TransferAccount[]> {
  const rows = await Promise.all(
    MANUAL_TRANSFER_METHODS.map((method) => accountForMethod(method)),
  );
  return rows.filter((a): a is TransferAccount => a !== null && Boolean(a));
}

/**
 * Order-scoped transfer instructions + current proof state. Reaches the
 * customer only through an owner-checked endpoint, so the receiving numbers
 * are public-by-necessity to the payer but never public data on the web.
 */
export async function getTransferInstructions(
  orderId: string,
  userId: string,
): Promise<{
  order: {
    id: string;
    orderNumber?: string | null;
    total: number;
    paymentStatus: string;
    paymentMethod: string;
  };
  account: TransferAccount;
  attemptsLeft: number;
  payment: null | {
    id: string;
    status: string;
    transactionRef?: string | null;
    failureReason?: string | null;
    submittedAt?: string | null;
 };
}> {
  const order = await loadOrder(orderId);
  assertManualProofContext(order, userId);
  // Existing orders keep their instructions even if the channel was disabled
  // mid-flight; only a full master switch (or a channel that never had
  // details) blocks them.
  const account = await accountForMethod(order.paymentMethod, { evenIfDisabled: true });
  if (!account) {
    throw new AppError('Direct transfer payments are temporarily unavailable. Contact support.', 422);
  }

  const payment = await findManualPayment(String(order._id), userId);
  const submittedAt = (payment?.metadata as any)?.submittedAt ?? null;

  return {
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      total: order.total,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
    },
    account,
    attemptsLeft: Math.max(0, MAX_PROOF_SUBMISSIONS - (payment?.verifyAttempts ?? 0)),
    payment: payment
      ? {
          id: String(payment._id),
          status: String(payment.status),
          transactionRef: payment.transactionRef ?? null,
          failureReason: payment.failureReason ?? null,
          submittedAt: typeof submittedAt === 'string' ? submittedAt : null,
        }
      : null,
  };
}

/**
 * Customer submits transfer proof: the transaction/reference ID from their
 * transfer receipt + the receipt screenshot itself.
 *
 * Guarantees:
 *  - the row is bound to THIS order only
 *  - the amount the admin later verifies is the server-side order total
 *    (customer-supplied amounts are never accepted)
 *  - duplicate submissions while an admin is already checking answer 409
 *  - the DB unique index on (gateway, transactionRef) stops one reference from
 *    being claimed by a second payment row (replay protection)
 *  - the receipt lands in a PRIVATE bucket; a customer can only view receipts
 *    for their own orders through the API
 *  - the outcome is `pending_verification` — nothing is settled here
 */
export async function submitManualTransferProof(
  orderId: string,
  userId: string,
  input: {
    transactionRef: string;
    receipt?: { buffer: Buffer; mimetype: string; ext: string; originalname?: string };
  },
): Promise<{ order: Order; payment: Payment }> {
  const order = await loadOrder(orderId);
  assertManualProofContext(order, userId);

  const payment = await findManualPayment(String(order._id), userId);
  if (!payment) throw new AppError('No direct-transfer payment exists for this order', 404);
  assertAmountMatch(Number(order.total), payment.amount);

  const submitError = manualProofSubmissionError(String(payment.status), payment.verifyAttempts ?? 0);
  if (submitError) throw CONFLICT(submitError);

  const transactionRef = normaliseTransactionRef(input.transactionRef);
  if (!input.receipt || !input.receipt.buffer || input.receipt.buffer.length === 0) {
    throw BAD_REQUEST('Upload the receipt screenshot of your transfer (JPG, PNG, WEBP or PDF).');
  }

  const bucket = env.MANUAL_PAYMENT_RECEIPT_BUCKET;
  await ensureBucket(bucket, false);
  const uploaded = await uploadBuffer(
    input.receipt.buffer,
    {
      mimetype: input.receipt.mimetype,
      ext: input.receipt.ext,
      folder: `receipts/${String(order.customer)}`,
    },
    { bucket, isPublic: false },
  );

  const now = new Date();
  const attempts = (payment.verifyAttempts ?? 0) + 1;
  const previousMetadata = (payment.metadata ?? {}) as Record<string, unknown>;
  const meta = {
    ...previousMetadata,
    channel: manualChannelForMethod(order.paymentMethod),
    receiptPath: uploaded.publicId,
    receiptOriginalName: input.receipt.originalname ?? null,
    receiptMimetype: input.receipt.mimetype,
    receiptSizeBytes: input.receipt.buffer.length,
    submittedAt: now.toISOString(),
    // Every submission beyond the first answers an admin request; the trail
    // shows the admin exactly which artefact was uploaded when.
    ...(attempts > 1 ? { resubmitCount: attempts - 1, lastResubmitAt: now.toISOString() } : {}),
  };

  try {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'pending_verification',
          transactionRef,
          gateway: 'manual',
          gatewayResponseCode: null,
          failureReason: null,
          paidAt: null,
          verifiedAt: null,
          initiatedAt: payment.initiatedAt ?? now,
          verifyAttempts: attempts,
          metadata: meta,
        },
      },
    );
  } catch (error) {
    // The unique index (gateway, transactionRef) rejects a reference another
    // payment row already carries — the definition of a replayed reference.
    if (String((error as Error)?.message ?? '').toLowerCase().includes('duplicat')) {
      throw CONFLICT(
        'This transaction reference has already been submitted for another payment. Copy the reference exactly as shown on your own receipt.',
      );
    }
    throw error;
  }

  const updatedOrder = await OrderModel.findById(String(order._id));
  if (updatedOrder) {
    updatedOrder.paymentStatus = 'pending_verification';
    updatedOrder.paymentGateway = 'manual';
    updatedOrder.paymentTransactionRef = transactionRef;
    updatedOrder.paymentFailureReason = null;
    updatedOrder.statusHistory.push({
      status: String(updatedOrder.status),
      note: `Transfer proof submitted — awaiting admin verification (submission ${attempts})`,
    });
    await updatedOrder.save();
  }

  // Audit trail: the submission itself (actor, timestamp, reference, amount).
  await PaymentVerificationModel.create({
    payment: String(payment._id),
    order: String(updatedOrder?._id ?? order._id),
    actor: userId,
    actorRole: 'customer',
    decision: 'receipt_submitted',
    reason: null,
    amount: payment.amount,
    transactionRef,
  }).catch(() => undefined);

  const freshPayment = (await PaymentModel.findById(payment._id)) as Payment;
  const freshOrder = (await OrderModel.findById(String(order._id))) as Order;

  await notifyCustomerProofSubmitted(freshOrder, attempts);
  await notifyAdminsProofSubmitted(freshOrder, attempts);

  return { order: freshOrder, payment: freshPayment };
}

/**
 * Short-lived signed URL for a receipt, ACCESS-CHECKED by the caller (the
 * customer must own the order; the admin path checks the admin role in the
 * route). The URL expires, so a receipt link is not a permanent public asset.
 */
export async function receiptSignedUrl(payment: Payment): Promise<string | null> {
  const path = (payment.metadata as any)?.receiptPath;
  if (!path || typeof path !== 'string') return null;
  return createSignedUrl(
    env.MANUAL_PAYMENT_RECEIPT_BUCKET,
    path,
    env.MANUAL_PAYMENT_RECEIPT_URL_MINUTES,
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadOrder(orderId: string) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  return order;
}

async function findManualPayment(orderId: string, userId: string): Promise<Payment | null> {
  return PaymentModel.findOne({
    order: orderId,
    kind: 'order',
    user: userId,
    method: { $in: [...MANUAL_TRANSFER_METHODS] },
  }).sort({ createdAt: -1 });
}

async function notifyCustomerProofSubmitted(order: Order, attempts: number): Promise<void> {
  await notifyUser(String(order.customer), {
    type: 'order',
    event: 'order_placed',
    refId: String(order._id),
    title: 'Payment submitted',
    body: `We received your transfer proof for order ${order.orderNumber}. Waiting for admin verification — your order stays unconfirmed until then.`,
    data: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      paymentStatus: 'pending_verification',
      submissionNumber: attempts,
    },
  });
}

/**
 * Admin queue alert. Deliberately NOT sent at order creation: a manual-transfer
 * order is real work for the admin only once real proof was submitted, and no
 * screenshot can settle it — the admin is being asked to CHECK, not to trust.
 */
async function notifyAdminsProofSubmitted(order: Order, attempts: number): Promise<void> {
  try {
    const admins = await UserModel.find({
      role: 'admin',
      status: 'active',
      deletedAt: null,
    })
      .select('_id')
      .lean();
    if (admins.length === 0) return;
    await Promise.all(
      admins.map((admin) =>
        notifyUser(String(admin._id), {
          type: 'order',
          event: 'payment_settled',
          refId: String(order._id),
          title: 'Transfer proof needs verification',
          body: `Order ${order.orderNumber} — Rs ${order.total}. Compare the submitted reference/receipt with the UBL statement before approving.`,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            submissionNumber: attempts,
          },
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Admin alerting is best-effort; the panel lists these payments regardless.
  }
}
