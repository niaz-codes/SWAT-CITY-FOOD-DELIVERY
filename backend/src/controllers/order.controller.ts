import type { Response } from 'express';
import { OrderModel, RiderProfileModel, UserModel, isGatewayPaymentMethod, isManualTransferMethod, type OrderStatus } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import {
  advanceOrderStatus,
  cancelOrder,
  computeOrderTotals,
  placeOrder,
} from '../services/order.service';
import { initiateOnlinePayment } from '../services/payment.service';
import { getTransferInstructions } from '../services/manualPayment.service';
import { emitToUser, SOCKET_EVENTS } from '../sockets';
import { createHandoffToken } from '../services/payments/handoffToken';
import { haversineKm } from '../utils/tokens';
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
  const redeemPointsRaw =
    typeof req.query.redeemPoints === 'string' ? Number(req.query.redeemPoints) : 0;
  const redeemPoints =
    Number.isFinite(redeemPointsRaw) && redeemPointsRaw > 0
      ? Math.floor(redeemPointsRaw)
      : 0;

  const totals = await computeOrderTotals(req.user._id, { promoCode, tip, redeemPoints });

  sendSuccess(res, {
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    platformFee: totals.platformFee,
    tip: totals.tip,
    loyaltyPointsRedeemed: totals.loyaltyPointsRedeemed,
    loyaltyDiscount: totals.loyaltyDiscount,
    total: totals.total,
    currency: 'PKR',
    itemCount: totals.items.reduce((n: number, i: any) => n + i.quantity, 0),
    estimatedMinutes: totals.estimatedMinutes,
    restaurant: {
      id: totals.restaurant._id,
      name: totals.restaurant.name,
      emoji: totals.restaurant.emoji,
      gradient: totals.restaurant.gradient,
      cuisine: totals.restaurant.cuisine,
    },
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
    idempotencyKey: req.body.idempotencyKey,
    redeemPoints: req.body.redeemPoints,
    scheduledFor: req.body.scheduledFor,
  });

  // Online payments are started AFTER the order exists, so the transaction is
  // bound to a real order total. The response carries whatever the gateway needs
  // to take the payer to their wallet (demo has none: it settles server-side
  // and the app just confirms the result).
  //
  // A replayed checkout attempt (same idempotency key) returns the already
  // settled pair — the payment is paid/failed/terminal, so re-initiating would
  // answer "Order already paid" and turn a legitimate replay into an error.
  const paymentSettled = ['paid', 'failed', 'refunded', 'cancelled'].includes(
    String(payment.status),
  );
  let handoff: Record<string, unknown> | null = null;
  if (!paymentSettled && isGatewayPaymentMethod(order.paymentMethod)) {
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

  const demoMode =
    order.paymentMethod === 'demo'
      ? { active: true, label: 'DEMO — NOT REAL MONEY' }
      : null;

  // Direct transfer orders skip gateways entirely: send the customer straight
  // to the transfer-instructions/proof-submission step on the payment screen.
  const transferDetails = isManualTransferMethod(order.paymentMethod)
    ? await getTransferInstructions(String(order._id), String(req.user._id)).catch(() => null)
    : null;

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
      transactionRef: payment.transactionRef ?? null,
    },
    demoMode,
    handoff,
    transferDetails,
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
    throw new AppError('You can only access your own orders', 403);
  }
  sendSuccess(res, { order });
});

/**
 * GET /orders/:id/track — the customer's live-delivery feed.
 *
 * One normalized payload both the socket stream (`rider:location`) and this
 * REST fallback agree on, so `trackLive` consumers get rider position, pickup
 * and drop-off coordinates on every poll — and NOTHING once tracking is over
 * (delivered / cancelled): a rider never disappears for the customer here, the
 * map simply stops being live.
 */
export const trackOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id)
    .populate('restaurant', 'name location addressLine area phone')
    .lean();
  if (!order) throw NOT_FOUND('Order');
  const isOwner = String(order.customer) === req.user._id;
  const isRider = order.rider && String(order.rider) === req.user._id;
  if (!isOwner && !isRider) throw new AppError('You can only track orders you are part of', 403);

  const LIVE_STATUSES: OrderStatus[] = ['rider_assigned', 'picked_up', 'on_the_way'];
  const trackingActive = Boolean(
    order.rider && LIVE_STATUSES.includes(order.status as OrderStatus),
  );

  // The rider doc is the customer-facing identity; the live position lives on
  // the rider profile (flushed every 10s by riderLocation.service).
  const [rider, riderProfile, restaurant] = await Promise.all([
    order.rider ? UserModel.findById(order.rider).select('name phone avatarUrl').lean() : null,
    order.rider
      ? RiderProfileModel.findOne({ user: order.rider })
          .select('name phone lastLocation isOnline')
          .lean()
      : null,
    order.restaurant as unknown as
      | {
          _id?: unknown;
          name?: string;
          addressLine?: string;
          area?: string;
          location?: { coordinates?: number[] };
        }
      | undefined,
  ]);

  // GeoJSON ordering holds throughout the codebase: coordinates[0]=lng, [1]=lat.
  const restaurantCoords = restaurant?.location?.coordinates;
  const pickup =
    restaurantCoords && restaurantCoords.length === 2
      ? { lat: Number(restaurantCoords[1]), lng: Number(restaurantCoords[0]) }
      : null;

  const destination = order.addressSnapshot?.lat != null && order.addressSnapshot?.lng != null
    ? { lat: Number(order.addressSnapshot.lat), lng: Number(order.addressSnapshot.lng) }
    : null;

  const lastLoc = (riderProfile?.lastLocation ?? null) as
    | { lat: number; lng: number; heading?: number; updatedAt?: unknown }
    | null;
  const riderLocation =
    lastLoc && typeof lastLoc.lat === 'number' && typeof lastLoc.lng === 'number'
      ? {
          lat: lastLoc.lat,
          lng: lastLoc.lng,
          heading: Number(lastLoc.heading ?? 0),
          updatedAt: lastLoc.updatedAt ? new Date(lastLoc.updatedAt as string).toISOString() : null,
        }
      : null;

  // Distance + ETA from the rider to their NEXT stop: the pickup point before
  // they collect the food, the customer afterwards. Straight-line km pushed
  // through the same ~22 km/h urban speed factor used elsewhere; a rider with
  // no fix yet simply reports no ETA instead of a lie.
  let riderDistanceKm: number | null = null;
  let etaMinutes: number | null = null;
  if (riderLocation && trackingActive) {
    const target = order.status === 'rider_assigned' ? pickup : destination;
    if (target) {
      riderDistanceKm = Math.round(haversineKm(target, riderLocation) * 10) / 10;
      etaMinutes = Math.max(1, Math.round((riderDistanceKm / 22) * 60));
    }
  }

  sendSuccess(res, {
    orderId: String(order._id),
    orderNumber: order.orderNumber ?? null,
    status: order.status,
    previousStatus: order.previousStatus ?? null,
    trackingActive,
    estimatedMinutes: Number(order.estimatedMinutes) || null,
    pickup: pickup
      ? { lat: pickup.lat, lng: pickup.lng, name: restaurant?.name ?? 'Restaurant', address: restaurant?.addressLine ?? '', area: restaurant?.area ?? '' }
      : null,
    destination: destination
      ? { lat: destination.lat, lng: destination.lng, address: order.addressSnapshot?.full ?? '' }
      : null,
    rider: rider
      ? {
          id: String(rider._id),
          name: riderProfile?.name ?? (rider as { name?: string }).name ?? 'Rider',
          phone: riderProfile?.phone ?? (rider as { phone?: string }).phone ?? '',
          avatarUrl: (rider as { avatarUrl?: string | null }).avatarUrl ?? null,
          online: Boolean(riderProfile?.isOnline),
          location: trackingActive ? riderLocation : null,
        }
      : null,
    riderDistanceKm,
    etaMinutes,
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

export type { OrderStatus };
