import type { Response } from 'express';
import {
  GATEWAY_PAYMENT_METHODS,
  OrderModel,
  PaymentModel,
  UserModel,
  isGatewayPaymentMethod,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import {
  abandonOnlinePayment,
  initiateOnlinePayment,
  verifyOnlinePayment,
} from '../services/payment.service';
import {
  availableGateways,
  jazzcashProvider,
  verifyJazzCashReturnSignature,
} from '../services/payments';
import { createHandoffToken, readHandoffToken } from '../services/payments/handoffToken';
import { creditTopupIfNeeded } from '../services/topup.service';
import { env, publicApiUrl } from '../config/env';

const GATEWAY_METHODS = GATEWAY_PAYMENT_METHODS;

/** GET /payments/methods — which gateways are usable right now. */
export const listPaymentMethods = asyncHandler(async (_req: AuthRequest, res: Response) => {
  sendSuccess(res, { methods: availableGateways() });
});

/** POST /orders/:id/payment — create a payment and get the gateway handoff. */
export const createOrderPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const method = req.body.paymentMethod;
  if (!isGatewayPaymentMethod(method)) {
    throw new AppError('Unsupported payment method', 422);
  }

  const order = await OrderModel.findById(req.params.id);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(req.user._id)) {
    throw new AppError('You can only pay for your own orders', 403);
  }

  const {
    payment,
    order: updatedOrder,
    handoff,
  } = await initiateOnlinePayment({
    userId: String(req.user._id),
    orderId: String(order._id),
    method,
    customerPhone: req.body.customerPhone,
    customerEmail: req.body.customerEmail,
    idempotencyKey: req.body.idempotencyKey,
  });

  if (!handoff.ok) {
    // Surface the gateway's own reason but keep the payment record as failed.
    throw new AppError(handoff.reason, 402);
  }

  // For form handoffs we hand back a tokenised URL rather than the raw fields:
  // the JazzCash payload contains pp_Password and must not reach the client.
  let handoffPayload: Record<string, unknown> | null = null;
  if (handoff.handoff) {
    if (handoff.handoff.type === 'form') {
      handoffPayload = {
        type: 'form',
        url: `${publicApiUrl}/api/payments/handoff/${createHandoffToken(String(payment._id))}`,
      };
    } else {
      handoffPayload = { type: 'redirect', url: handoff.handoff.url };
    }
  }

  sendSuccess(res, {
    payment: {
      id: payment._id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      transactionRef: payment.transactionRef,
    },
    order: {
      id: updatedOrder._id,
      orderNumber: updatedOrder.orderNumber,
      paymentStatus: updatedOrder.paymentStatus,
    },
    handoff: handoffPayload,
  });
});

/** GET /orders/:id/payment — current payment state (for polling). */
export const getOrderPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(req.user._id)) {
    throw new AppError('You can only view your own orders', 403);
  }

  const payments = await PaymentModel.find({ order: order._id }).sort({ createdAt: -1 }).lean();
  const active =
    payments.find((p: any) => p.status === 'processing' || p.status === 'pending') ?? payments[0];

  sendSuccess(res, {
    orderPaymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    total: order.total,
    payment: active
      ? {
          id: active._id,
          status: active.status,
          method: active.method,
          amount: active.amount,
          transactionRef: active.transactionRef,
          gatewayRef: active.gatewayRef,
          failureReason: active.failureReason,
        }
      : null,
  });
});

/** POST /orders/:id/payment/verify — authoritative server-to-server check. */
export const verifyOrderPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(req.user._id)) {
    throw new AppError('You can only verify your own orders', 403);
  }

  const payment = await PaymentModel.findOne({
    order: order._id,
    method: { $in: [...GATEWAY_METHODS] },
  }).sort({ createdAt: -1 });
  if (!payment || !payment.transactionRef || !isGatewayPaymentMethod(payment.method)) {
    throw new AppError('No online payment to verify for this order', 404);
  }

  const method = payment.method;
  const transactionRef = payment.transactionRef;

  const {
    payment: updated,
    order: updatedOrder,
    result,
  } = await verifyOnlinePayment({
    transactionRef,
    method,
  });

  sendSuccess(res, {
    status: result.status,
    reason: result.status === 'paid' ? undefined : result.reason,
    payment: {
      id: updated._id,
      status: updated.status,
      method: updated.method,
      gatewayRef: updated.gatewayRef,
      transactionRef: updated.transactionRef,
      failureReason: updated.failureReason,
    },
    order: updatedOrder
      ? {
          id: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          paymentStatus: updatedOrder.paymentStatus,
          paymentVerifiedAt: updatedOrder.paymentVerifiedAt,
        }
      : null,
  });
});

/** POST /orders/:id/payment/abandon — user backed out of the gateway. */
export const abandonOrderPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id);
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== String(req.user._id)) {
    throw new AppError('You can only manage your own orders', 403);
  }
  const payment = await PaymentModel.findOne({
    order: order._id,
    status: { $in: ['pending', 'processing'] },
  }).sort({
    createdAt: -1,
  });
  if (!payment) throw new AppError('No in-flight payment to abandon', 404);
  await abandonOnlinePayment(String(payment._id), String(req.user._id));
  sendSuccess(res, { ok: true });
});

/**
 * There is intentionally no "switch to cash on delivery" endpoint.
 *
 * It used to exist at POST /orders/:id/payment/cash and called
 * markCashOrderPending(). That let an order with a failed or abandoned gateway
 * payment be reclassified as payable-on-delivery, which means an order could be
 * marked actionable without any money ever moving. A failed payment must instead
 * be settled by a fresh verified gateway payment.
 */

/**
 * GET /payments/handoff/:token — public, short-lived handoff page.
 *
 * Renders an auto-submitting HTML form that posts the signed JazzCash payload
 * straight to the gateway. This keeps pp_Password on the server while still
 * working with a plain browser (no JS SDK, no exposed secrets).
 *
 * The route takes a signed token rather than a raw payment id: it is public, and
 * a payment id is a guessable ObjectId that must not double as a capability.
 */
export const renderGatewayHandoff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const paymentId = readHandoffToken(req.params.token);
  if (!paymentId) throw new AppError('This payment link is invalid or has expired', 410);

  const payment = await PaymentModel.findById(paymentId);
  if (!payment || payment.status !== 'processing') throw NOT_FOUND('Payment');
  if (payment.method !== 'jazzcash' || !isGatewayPaymentMethod(payment.gateway)) {
    throw new AppError('Unsupported handoff', 400);
  }

  // Belt and braces: even a valid token cannot outlive the payment's own expiry.
  if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
    throw new AppError('This payment session has expired. Please start again.', 410);
  }

  // Rebuild the signed payload server-side at render time.
  const order = payment.order ? await OrderModel.findById(payment.order) : null;
  const customer = await UserModel.findById(payment.user).select('name phone email').lean();

  // `orderNumber` must be present in the hash, so a missing order cannot be
  // rendered into a payload the gateway would reject.
  if (!order?.orderNumber) throw new AppError('Order is missing its number', 409);

  const handoff = await jazzcashProvider.initiate({
    transactionRef: payment.transactionRef as string,
    amountPkr: payment.amount,
    orderNumber: order.orderNumber,
    description: `Swat City Food Delivery Order ${order.orderNumber}`.slice(0, 100),
    returnUrl: env.PAYMENT_RETURN_URL || `${publicApiUrl}/api/payments/jazzcash/return`,
    customerPhone: String(customer?.phone ?? ''),
    customerEmail: String(customer?.email ?? ''),
  });

  if (!handoff.ok || handoff.handoff?.type !== 'form') {
    throw new AppError(handoff.ok ? 'Unsupported handoff type' : handoff.reason, 400);
  }

  const fields = handoff.handoff.fields;
  const action = escapeHtml(handoff.handoff.url);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Redirecting to JazzCash…</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0E3F3A;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{max-width:340px;text-align:center;padding:32px}
  h1{font-size:18px;margin:0 0 8px}
  p{color:#B8CFCB;font-size:14px;margin:0}
  .spinner{width:28px;height:28px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;margin:0 auto 20px;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Redirecting to JazzCash…</h1>
    <p>Please wait while we securely transfer you to the payment page.</p>
  </div>
  <form id="f" method="POST" action="${action}">
${Object.entries(fields)
  .map(([k, v]) => `    <input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
  .join('\n')}
  </form>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).send(html);
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /web/payments/jazzcash/return — public gateway return.
 *
 * The browser lands here after the payer finishes. We verify the returned
 * SecureHash for defence in depth AND perform the authoritative inquiry, then
 * redirect back into the app. Never trust the query params alone.
 */
export const jazzCashReturn = asyncHandler(async (req: AuthRequest, res: Response) => {
  // The query string is attacker-controllable, so every value is coerced to a
  // string before it reaches the signature check.
  const returnFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') returnFields[key] = value;
  }

  const signatureValid = verifyJazzCashReturnSignature(returnFields);
  const transactionRef = returnFields.pp_TxnRefNo;

  let status = 'unknown';
  let orderId = '';

  if (transactionRef) {
    const payment = await PaymentModel.findOne({ transactionRef, method: 'jazzcash' });
    if (payment) {
      orderId = payment.order ? String(payment.order) : '';
      if (!signatureValid) {
        // Tampered or unverifiable return. Deliberately do NOT settle: the app will
        // re-verify server-to-server and show the real state.
        status = 'unverified';
      } else {
        try {
          const { result } = await verifyOnlinePayment({ transactionRef, method: 'jazzcash' });
          status = result.status;
        } catch {
          // A gateway hiccup must not lose the payer; the app polls /verify.
          status = 'pending';
        }
      }
    }
  }

  const appRedirect = `swatcity://payment-result?orderId=${encodeURIComponent(orderId)}&status=${encodeURIComponent(status)}`;
  res.redirect(302, appRedirect);
});

/**
 * POST/GET /easypaisa/notify — public IPN / server notification endpoint.
 *
 * Easypaisa's server or the merchant's redirect hits this when a MA transaction
 * completes. The wire spec handed to merchants is delivered separately by the
 * Easypaisa team when IPN is enabled, so this endpoint stays deliberately
 * tolerant: it only needs `orderId` (our `transactionRef`) to relocate the
 * payment, then it re-inquires the gateway server-to-server and settles from
 * the inquiry result — the notification body itself is never trusted to carry
 * status or amount.
 *
 * Always answers 200 with the resulting state so the gateway stops retrying.
 */
export const easypaisaNotify = asyncHandler(async (req: AuthRequest, res: Response) => {
  const raw: Record<string, unknown> = { ...(req.query ?? {}), ...(req.body ?? {}) };
  const transactionRef = typeof raw.orderId === 'string' ? raw.orderId.trim() : undefined;
  if (!transactionRef) throw new AppError('Missing orderId', 400);

  const payment = await PaymentModel.findOne({ transactionRef, method: 'easypaisa' });
  if (!payment) throw NOT_FOUND('Payment');

  // Terminal states need no gateway round-trip; repeating an already-paid ping is
  // a no-op that still guarantees the wallet top-up got credited.
  if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'cancelled') {
    if (payment.status === 'paid' && payment.kind === 'topup') {
      await creditTopupIfNeeded(payment!, payment.user as string);
    }
    sendSuccess(res, { ok: true, status: payment.status, idempotent: true });
    return;
  }

  const { payment: settled, result } = await verifyOnlinePayment({
    transactionRef,
    method: 'easypaisa',
  });
  if (result.status === 'paid' && (settled as any)?.kind === 'topup') {
    await creditTopupIfNeeded(settled as any, String((settled as any).user));
  }
  sendSuccess(res, { ok: true, status: result.status });
});
