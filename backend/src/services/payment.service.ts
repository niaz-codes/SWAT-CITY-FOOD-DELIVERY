import { randomUUID } from 'crypto';
import { env, publicApiUrl } from '../config/env';
import {
  OrderModel,
  PaymentModel,
  type GatewayPaymentMethod,
  type Payment,
} from '../models';
import { getProvider } from './payments';
import type { GatewayInitiateResult, GatewayVerifyResult, InitiateInput } from './payments/types';
import { AppError, BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { notifyUser } from './notification.service';
import { Types } from 'mongoose';

const GATEWAYS: readonly GatewayPaymentMethod[] = ['easypaisa', 'jazzcash'];

type OrderDoc = Awaited<ReturnType<typeof OrderModel.findById>> & Record<string, unknown>;
type PaymentDoc = Awaited<ReturnType<typeof PaymentModel.findById>> & Record<string, unknown>;

export interface InitiateOnlinePaymentInput {
  userId: string;
  orderId: string;
  method: GatewayPaymentMethod;
  customerPhone?: string;
  customerEmail?: string;
  /** Forces a specific idempotency key so a retry reuses the same payment. */
  idempotencyKey?: string;
}

/**
 * Starts a gateway payment for an existing order.
 *
 * Idempotency is enforced by the unique index on `Payment.idempotencyKey`. When a
 * key is supplied and already in flight, the existing payment and its handoff are
 * returned instead of creating a second one, so a double tap or a network retry
 * can never produce two charges.
 */
export async function initiateOnlinePayment({
  userId,
  orderId,
  method,
  customerPhone,
  customerEmail,
  idempotencyKey,
}: InitiateOnlinePaymentInput): Promise<{
  payment: PaymentDoc;
  order: OrderDoc;
  handoff: GatewayInitiateResult;
}> {
  if (!GATEWAYS.includes(method)) throw BAD_REQUEST('Unsupported payment method');

  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(userId)) {
    throw new AppError('You can only pay for your own orders', 403);
  }
  if (order.paymentStatus === 'paid') throw CONFLICT('Order already paid');
  if (order.status === 'cancelled') throw CONFLICT('Cannot pay for a cancelled order');

  const provider = getProvider(method);
  if (!provider.isConfigured()) {
    return {
      payment: null as unknown as PaymentDoc,
      order: order as unknown as OrderDoc,
      handoff: { ok: false, reason: provider.configurationHint() },
    };
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + env.PAYMENT_EXPIRY_MINUTES * 60_000);

  // Reuse an existing in-flight payment when the caller supplies a stable key.
  let payment = idempotencyKey
    ? await PaymentModel.findOne({ idempotencyKey, user: userId, order: order._id })
    : null;

  if (payment && ['failed', 'cancelled'].includes(payment.status)) {
    // A terminal payment cannot be resurrected; the caller must start a new attempt.
    throw CONFLICT('This payment attempt already failed. Please try again.');
  }

  if (!payment) {
    // `placeOrder` already opened a pending Payment row for this order. Adopting
    // it (instead of creating a second one) keeps exactly one payment record per
    // attempt, so a duplicate/stray pending payment can never be settled later.
    const existing = await PaymentModel.findOne({
      order: order._id,
      kind: 'order',
      method,
      status: { $in: ['pending', 'processing'] },
    }).sort({ createdAt: -1 });

    if (existing) {
      existing.idempotencyKey = existing.idempotencyKey ?? idempotencyKey;
      existing.amount = order.total;
      existing.expiresAt = expiry;
      await existing.save();
      payment = existing;
    }
  }

  if (!payment) {
    payment = await PaymentModel.create({
      user: new Types.ObjectId(userId),
      kind: 'order',
      order: order._id,
      method,
      status: 'pending',
      amount: order.total,
      currency: 'PKR',
      idempotencyKey,
      gateway: method,
      transactionRef: generateTransactionRef(order.orderNumber || String(order._id), method),
      expiresAt: expiry,
    });
  }

  // Only JazzCash's hosted checkout redirects the payer. Easypaisa MA debits the
  // wallet directly, so no return URL is meaningful for it.
  // This must match the mounted route (`/api/payments/jazzcash/return`), not the
  // app's deep link: the gateway returns in a browser, where the app scheme is
  // not guaranteed to resolve.
  const returnUrl =
    method === 'jazzcash'
      ? env.PAYMENT_RETURN_URL || `${publicApiUrl}/api/payments/jazzcash/return`
      : '';

  const initiateInput: InitiateInput = {
    transactionRef: payment.transactionRef as string,
    amountPkr: payment.amount,
    orderNumber: order.orderNumber || String(order._id),
    description: `Swat City Order ${order.orderNumber || order._id}`,
    returnUrl,
    customerPhone: customerPhone ?? '',
    customerEmail: customerEmail ?? '',
  };

  const handoff = await provider.initiate(initiateInput);

  if (handoff.ok) {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'processing',
          initiatedAt: payment.initiatedAt ?? now,
          gatewayRef: handoff.gatewayRef ?? payment.gatewayRef ?? null,
        },
      },
    );
    order.payment = payment._id;
    order.paymentMethod = method;
    order.paymentGateway = method;
    order.paymentTransactionRef = payment.transactionRef as string;
    await order.save();
  } else {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'failed',
          failedAt: now,
          failureReason: handoff.reason,
          gatewayResponseCode: handoff.code ?? null,
        },
      },
    );
  }

  // Same reasoning as in `verifyOnlinePayment`: return the persisted state, not
  // the pre-gateway in-memory copy.
  const initiated = (await PaymentModel.findById(payment._id)) as PaymentDoc | null;

  return {
    payment: initiated ?? (payment as unknown as PaymentDoc),
    order: order as unknown as OrderDoc,
    handoff,
  };
}

/**
 * Server-to-server verification — the authoritative source of truth.
 *
 * A browser redirect is never trusted: this asks the gateway directly and only
 * writes `paid` when the gateway confirms it AND the amount matches what we
 * intended to charge. Repeated calls are safe (idempotent) because a terminal
 * payment returns immediately without re-contacting the gateway.
 */
export async function verifyOnlinePayment(input: {
  transactionRef: string;
  method: GatewayPaymentMethod;
}): Promise<{ payment: PaymentDoc; order?: OrderDoc; result: GatewayVerifyResult }> {
  if (!GATEWAYS.includes(input.method)) throw BAD_REQUEST('Unsupported payment method');

  const payment = await PaymentModel.findOne({
    transactionRef: input.transactionRef,
    gateway: input.method,
  });
  if (!payment) throw NOT_FOUND('Payment');

  const order = payment.order ? await OrderModel.findById(payment.order) : undefined;

  if (payment.status === 'paid') {
    return {
      payment: payment as unknown as PaymentDoc,
      order: order as unknown as OrderDoc,
      result: {
        status: 'paid',
        amount: payment.amount,
        currency: payment.currency ?? 'PKR',
        gatewayRef: payment.gatewayRef ?? undefined,
      },
    };
  }
  if (payment.status === 'refunded' || payment.status === 'cancelled') {
    return {
      payment: payment as unknown as PaymentDoc,
      order: order as unknown as OrderDoc,
      result: { status: 'failed', reason: `Payment is ${payment.status}` },
    };
  }

  const provider = getProvider(input.method);
  const result = await provider.verify({
    transactionRef: input.transactionRef,
    expectedAmountPkr: payment.amount,
    gatewayRef: payment.gatewayRef ?? undefined,
  });

  const now = new Date();
  const attempts = (payment.verifyAttempts ?? 0) + 1;

  if (result.status === 'paid') {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'paid',
          paidAt: now,
          verifiedAt: now,
          verifyAttempts: attempts,
          gatewayRef: result.gatewayRef ?? payment.gatewayRef ?? null,
          failureReason: null,
          metadata: sanitiseMetadata(result.raw),
        },
      },
    );

    if (order) {
      const wasPaid = order.paymentStatus === 'paid';
      order.paymentStatus = 'paid';
      order.paymentVerifiedAt = now;
      order.paymentGateway = input.method;
      order.paymentTransactionRef = input.transactionRef;
      order.paymentVerifyAttempts = attempts;
      order.paymentFailureReason = undefined;
      await order.save();

      // Only announce the order once, the first time it becomes paid.
      if (!wasPaid) {
        await notifyUser(String(order.customer), {
          type: 'order',
          event: 'order_placed',
          refId: String(order._id),
          title: 'Payment successful',
          body: `Payment received for order ${order.orderNumber}. The restaurant has your order.`,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: 'paid',
          },
        });
      }
    }
  } else if (result.status === 'failed') {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'failed',
          failedAt: now,
          verifiedAt: now,
          verifyAttempts: attempts,
          failureReason: result.reason,
          gatewayResponseCode: result.code ?? null,
          metadata: sanitiseMetadata(result.raw),
        },
      },
    );

    if (order) {
      order.paymentStatus = 'failed';
      order.paymentFailureReason = result.reason;
      order.paymentVerifyAttempts = attempts;
      await order.save();
    }
  } else {
    // Still in flight: record the attempt so we can detect a stuck transaction.
    await PaymentModel.updateOne(
      { _id: payment._id },
      { $set: { verifyAttempts: attempts, metadata: sanitiseMetadata(result.raw) } },
    );
    if (order) order.paymentVerifyAttempts = attempts;
    if (order) await order.save();
  }

  // The in-memory `payment` document still holds the pre-update state, and the
  // caller renders that state to the user. Re-read it so a `pending` result can
  // never be reported to the client as `paid`.
  const settled = (await PaymentModel.findById(payment._id)) as PaymentDoc | null;

  return {
    payment: settled ?? (payment as unknown as PaymentDoc),
    order: order as unknown as OrderDoc,
    result,
  };
}

/**
 * Reference we generate and the gateway stores. Easypaisa treats `orderId` as its
 * primary lookup key and requires a fresh value per attempt, so the random suffix
 * is what makes a retry a distinct transaction rather than a duplicate.
 */
export function generateTransactionRef(orderNumberOrId: string, method: GatewayPaymentMethod): string {
  const clean = String(orderNumberOrId).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'ORDER';
  const prefix = method === 'easypaisa' ? 'EP' : 'JC';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${clean}-${prefix}-${suffix}`;
}

/**
 * Strips anything credential-shaped before persisting a gateway response.
 * `pp_Password`, salts and SecureHash values must never reach the database.
 */
function sanitiseMetadata(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const blocked = /password|secret|salt|securehash|credential|apikey|token/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (blocked.test(key)) continue;
    if (value === null || typeof value !== 'object') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** User-initiated abandon: marks an in-flight payment cancelled. */
export async function abandonOnlinePayment(paymentId: string, userId: string): Promise<void> {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) throw NOT_FOUND('Payment');
  if (String(payment.user) !== String(userId)) {
    throw new AppError('You can only manage your own payments', 403);
  }
  if (payment.status === 'paid') throw CONFLICT('Cannot abandon a paid payment');
  if (payment.status === 'cancelled') return;

  await PaymentModel.updateOne(
    { _id: payment._id },
    { $set: { status: 'cancelled', failedAt: new Date(), failureReason: 'User abandoned the payment' } },
  );
}

/**
 * Retargets an order at cash-on-delivery.
 *
 * Used when a customer starts an online payment and then changes their mind. Any
 * in-flight gateway payment is cancelled for audit, the order's active payment
 * becomes a cash record awaiting collection, and — since COD is immediately
 * actionable — the customer is now notified that the order reached the kitchen.
 */
export async function markCashOrderPending(input: { orderId: string; userId: string }): Promise<OrderDoc> {
  const order = await OrderModel.findById(input.orderId);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(input.userId)) {
    throw new AppError('You can only pay for your own orders', 403);
  }
  if (order.paymentStatus === 'paid') throw CONFLICT('Order already paid');

  await PaymentModel.updateMany(
    {
      order: order._id,
      method: { $in: [...GATEWAYS] },
      status: { $in: ['pending', 'processing'] },
    },
    { $set: { status: 'cancelled', failedAt: new Date(), failureReason: 'Switched to cash on delivery' } },
  );

  const existing = order.payment ? await PaymentModel.findById(order.payment) : null;

  if (existing) {
    existing.method = 'cash';
    existing.status = 'pending';
    existing.gateway = 'cash';
    existing.transactionRef = undefined;
    existing.gatewayRef = undefined;
    existing.initiatedAt = null;
    existing.expiresAt = null;
    await existing.save();
  } else {
    const created = await PaymentModel.create({
      user: new Types.ObjectId(input.userId),
      kind: 'order',
      order: order._id,
      method: 'cash',
      status: 'pending',
      amount: order.total,
      currency: 'PKR',
      gateway: 'cash',
    });
    order.payment = created._id;
  }

  const wasAlreadyActionable = order.paymentMethod === 'cash';

  order.paymentMethod = 'cash';
  order.paymentStatus = 'pending';
  order.paymentGateway = undefined;
  order.paymentTransactionRef = undefined;
  order.paymentVerifiedAt = null;
  await order.save();

  if (!wasAlreadyActionable) {
    await notifyUser(input.userId, {
      type: 'order',
      event: 'order_placed',
      refId: String(order._id),
      title: 'Order placed',
      body: `Your order ${order.orderNumber} has been sent to the kitchen. Pay cash on delivery.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
    });
  }

  return order as unknown as OrderDoc;
}

export type { Payment };