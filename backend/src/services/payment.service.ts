import { randomUUID } from 'crypto';
import { env, publicApiUrl } from '../config/env';
import {
  CartModel,
  OrderModel,
  PaymentModel,
  type GatewayPaymentMethod,
  type Payment,
} from '../models';
import { getProvider } from './payments';
import type { GatewayInitiateResult, GatewayVerifyResult, InitiateInput } from './payments/types';
import { AppError, BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { notifyUser } from './notification.service';
import { notifyAdminsNewOrder } from './order.service';

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
      user: userId,
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
    description: `Swat City Food Delivery Order ${order.orderNumber || order._id}`,
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
 * Server-to-server verification - the authoritative source of truth.
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
        // Money is confirmed, so the basket that produced this order can go.
        //
        // Guarded on restaurant + createdAt so a cart the customer started
        // *after* placing this order (different restaurant, or a retry build) is
        // never wiped by an older order settling.
        await CartModel.findOneAndUpdate(
          {
            user: order.customer,
            restaurant: order.restaurant,
            createdAt: { $lte: order.createdAt },
            'items.0': { $exists: true },
          },
          { $set: { items: [], subtotal: 0, restaurant: undefined } },
        );

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

        // A gateway order only becomes real work once the money is confirmed,
        // so the admin alert is sent here rather than at creation time.
        await notifyAdminsNewOrder(order);
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
export function generateTransactionRef(
  orderNumberOrId: string,
  method: GatewayPaymentMethod,
): string {
  const clean =
    String(orderNumberOrId)
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 16) || 'ORDER';
  const prefix = method === 'easypaisa' ? 'EP' : 'JC';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${clean}-${prefix}-${suffix}`;
}

/**
 * Strips anything credential-shaped before persisting a gateway response.
 * `pp_Password`, salts and SecureHash values must never reach the database.
 */
function sanitiseMetadata(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
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
    {
      $set: {
        status: 'cancelled',
        failedAt: new Date(),
        failureReason: 'User abandoned the payment',
      },
    },
  );
}

/**
 * markCashOrderPending() was deleted.
 *
 * It retargeted an order at cash-on-delivery: it cancelled any in-flight gateway
 * payment, rewrote the order's active Payment to `method: 'cash'`,
 * `gateway: 'cash'`, cleared the gateway reference, reset `paymentStatus` to
 * 'pending' and then notified the kitchen that the order had been placed.
 *
 * That combination meant an order could become actionable again with no money
 * ever collected — the exact pretend-success the payment rules forbid. It was
 * reachable from POST /payments/orders/:id/payment/cash.
 *
 * A failed or abandoned payment is now left failed. The only way forward is a
 * fresh verified gateway payment via createOrderPayment() + verifyOrderPayment().
 */

export type { Payment };
