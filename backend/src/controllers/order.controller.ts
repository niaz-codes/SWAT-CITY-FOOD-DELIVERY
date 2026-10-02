import type { Response } from 'express';
import { OrderModel, type OrderStatus } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import {
  advanceOrderStatus,
  cancelOrder,
  computeOrderTotals,
  getOrderForUser,
  placeOrder,
} from '../services/order.service';
import { initiateOnlinePayment } from '../services/payment.service';
import { emitToUser, SOCKET_EVENTS } from '../sockets';
import { availableGateways } from '../services/payments';
import { createHandoffToken } from '../services/payments/handoffToken';
import { publicApiUrl } from '../config/env';

/**
 * GET /orders/quote — server-authoritative price preview for the checkout
 * screen. The client must never be the source of truth for money: this returns
 * the exact same figures `placeOrder` will charge.
 */
export const quoteOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();

  // `Number()` happily turns 'abc' or '' into NaN, which would flow through as a
  // real-looking total. Validate before it can reach the pricing maths.
  let tip: number | undefined;
  if (req.query.tip !== undefined) {
    const raw = Array.isArray(req.query.tip) ? req.query.tip[0] : req.query.tip;
    tip = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(tip) || tip < 0 || tip > 5000) {
      throw BAD_REQUEST('Tip must be a number between 0 and 5000');
    }
  }
  const promoCode = typeof req.query.promoCode === 'string' ? req.query.promoCode : undefined;

  const totals = await computeOrderTotals(req.user._id, { promoCode, tip });

  sendSuccess(res, {
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    platformFee: totals.platformFee,
    tip: totals.tip,
    total: totals.total,
    currency: 'PKR',
    itemCount: totals.items.reduce((n, i) => n + i.quantity, 0),
    estimatedMinutes: totals.estimatedMinutes,
    restaurant: {
      id: totals.restaurant._id,
      name: totals.restaurant.name,
      emoji: totals.restaurant.emoji,
      gradient: totals.restaurant.gradient,
      cuisine: totals.restaurant.cuisine,
    },
    methods: availableGateways(),
  });
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();

  const { order, payment } = await placeOrder({
    customerId: req.user._id,
    addressId: req.body.addressId,
    paymentMethod: req.body.paymentMethod,
    promoCode: req.body.promoCode,
    tip: req.body.tip,
    note: req.body.note,
  });

  // Online wallets are started AFTER the order exists, so the transaction is
  // bound to a real order total. The response carries whatever the gateway needs
  // to take the payer to their wallet.
  let handoff: Record<string, unknown> | null = null;
  if (order.paymentMethod === 'easypaisa' || order.paymentMethod === 'jazzcash') {
    const method = order.paymentMethod;
    const result = await initiateOnlinePayment({
      userId: req.user._id,
      orderId: String(order._id),
      method,
      customerPhone: req.body.customerPhone ?? req.body.phone,
      customerEmail: req.body.customerEmail,
      idempotencyKey: req.body.idempotencyKey,
    });

    if (!result.handoff.ok) {
      // Nothing was charged, so release the order instead of leaving an unpaid
      // order sitting in the restaurant's queue.
      order.status = 'cancelled';
      order.previousStatus = 'pending';
      order.cancelReason = `Payment could not be started: ${result.handoff.reason}`;
      order.cancelledBy = 'system';
      order.paymentStatus = 'failed';
      order.statusHistory.push({ status: 'cancelled', note: 'Payment could not be started' });
      await order.save();

      throw new AppError(result.handoff.reason, 402);
    }

    if (result.handoff.handoff) {
      handoff =
        result.handoff.handoff.type === 'form'
          ? {
              type: 'form',
              // The signed payload (which contains pp_Password) is rendered by the
              // server at this URL rather than returned to the client.
              url: `${publicApiUrl}/api/payments/handoff/${createHandoffToken(String(result.payment._id))}`,
            }
          : { type: 'redirect', url: result.handoff.handoff.url };
    }
  }

  sendSuccess(res, {
    order: {
      _id: order._id,
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentTransactionRef: order.paymentTransactionRef ?? null,
      total: order.total,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      platformFee: order.platformFee,
      estimatedMinutes: order.estimatedMinutes,
      createdAt: order.createdAt,
      items: order.items,
      addressSnapshot: order.addressSnapshot,
    },
    payment: {
      id: payment._id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
    },
    handoff,
  });
});

export const myOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));
  const query: Record<string, unknown> = { customer: req.user._id, deletedAt: null };
  if (status) query.status = status;

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate('restaurant', 'name emoji gradient cuisine deliveryTimeMin')
      .lean(),
    OrderModel.countDocuments(query),
  ]);

  sendSuccess(res, { orders }, { page: p, limit: l, total });
});

export const orderDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id)
    .populate('restaurant', 'name emoji gradient cuisine phone addressLine area')
    .populate('rider', 'name phone avatarUrl')
    .lean();
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== req.user._id) {
    const { riderId } = order.rider ? { riderId: String(order.rider) } : { riderId: '' };
    if (riderId !== req.user._id) throw new AppError('You can only access your own orders', 403);
  }
  sendSuccess(res, { order });
});

export const trackOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id)
    .populate('rider', 'name phone avatarUrl lastLocation')
    .lean();
  if (!order) throw NOT_FOUND('Order');
  const isOwner = String(order.customer) === req.user._id;
  const isRider = order.rider && String(order.rider) === req.user._id;
  if (!isOwner && !isRider) throw new AppError('You can only track orders you are part of', 403);
  sendSuccess(res, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    statusHistory: order.statusHistory,
    rider: order.rider,
    estimatedMinutes: order.estimatedMinutes,
  });
});

export const cancelOrderCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await cancelOrder({
    orderId: req.params.id,
    actorId: req.user._id,
    by: 'customer',
    reason: req.body.reason,
  });
  emitToUser(String(order.customer), SOCKET_EVENTS.orderStatus, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: 'cancelled',
  });
  sendSuccess(res, { order });
});

export const customerAdvanceStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Customers cannot skip lifecycle gates; this route is a safety-net for
  // demo/tracking: they may only request the next valid state for display.
  if (!req.user) throw UNAUTHORIZED();
  const order = await getOrderForUser(req.params.id, req.user._id);
  sendSuccess(res, { order, validNext: order.status });
});

export type { OrderStatus };
