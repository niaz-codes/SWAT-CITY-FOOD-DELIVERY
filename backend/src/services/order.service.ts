import type { Doc } from '../db/model';
import {
  AddressModel,
  CartModel,
  FoodItemModel,
  OrderItemModel,
  OrderModel,
  PaymentModel,
  PromotionModel,
  RestaurantModel,
  RiderProfileModel,
  UserModel,
  WalletTransactionModel,
  type NotificationEvent,
  type Order,
  type OrderCheckoutMethod,
  type OrderStatus,
  type Payment,
  type PaymentStatus,
} from '../models';
import { notifyUser } from './notification.service';
import { creditWallet, getOrCreateWallet } from './wallet.service';
import { assertRiderApproved } from './riderApproval.service';
import {
  claimRiderOrder,
  dispatchOrder,
  paymentEligible,
  revertRiderStatusIfIdle,
  stopDispatchForOrder,
} from './dispatch.service';
import { getIO, isSocketReady, SOCKET_EVENTS } from '../sockets';
import { AppError, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { haversineKm, humanId } from '../utils/tokens';
import { getSetting } from './settings.service';
import {
  assertRedeemable,
  awardLoyaltyPoints,
  debitLoyaltyPoints,
  getLoyaltyConfig,
  pointsDiscountFor,
  loyaltyBalanceFor,
  refundLoyaltyPoints,
  scheduledForError,
} from './loyalty.service';
import { awardReferralOnDelivered } from './referral.service';
import { canAssignRider } from '../utils/orderPolicy';
import { isManualTransferMethod, manualChannelForMethod } from '../models';

/** Allowed forward transitions of the order lifecycle (spec-defined). */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['rider_assigned', 'cancelled'],
  rider_assigned: ['picked_up', 'cancelled'],
  picked_up: ['on_the_way'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const PLATFORM_FEE = 15;
const FREE_DELIVERY_THRESHOLD = 800;
/** Upper bound per line item, so a tampered cart cannot order 10,000 portions. */
const MAX_ITEM_QUANTITY = 50;
const RIDER_PAYOUT_RATE = 0.75; // % of delivery+platform fees paid to rider

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_FLOW[from]?.includes(to) ?? false;
}

export function transitionError(from: OrderStatus, to: OrderStatus): string {
  return `Cannot move order from '${from}' to '${to}'`;
}

/**
 * Maps an order lifecycle transition onto the push-notification event that the
 * mobile app uses for tap routing. Covers every status the spec requires:
 * placed, accepted, preparing, ready, rider assigned, picked up, on the way,
 * delivered and cancelled/rejected.
 */
const ORDER_STATUS_EVENTS: Record<OrderStatus, NotificationEvent> = {
  pending: 'order_placed',
  confirmed: 'order_accepted',
  preparing: 'order_preparing',
  ready: 'order_ready',
  rider_assigned: 'rider_assigned',
  picked_up: 'rider_picked_up',
  on_the_way: 'rider_on_the_way',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
};

const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { title: string; body: (n: string, r: string) => string }
> = {
  pending: {
    title: 'Order placed',
    body: (n, r) => `Your order ${n} at ${r} has been sent to the kitchen.`,
  },
  confirmed: {
    title: 'Order accepted',
    body: (n, r) => `${r} accepted your order ${n}. It will be prepared shortly.`,
  },
  preparing: {
    title: 'Preparing your order',
    body: (n, r) => `${r} is now cooking order ${n}.`,
  },
  ready: {
    title: 'Order ready',
    body: (n, r) => `Order ${n} at ${r} is packed and waiting for a rider.`,
  },
  rider_assigned: {
    title: 'Rider assigned',
    body: (n) => `A rider has been assigned to order ${n} and is heading to the restaurant.`,
  },
  picked_up: {
    title: 'Rider picked up your order',
    body: (n) => `Your order ${n} has been picked up and is on the move.`,
  },
  on_the_way: {
    title: 'Order on the way',
    body: (n) => `Your order ${n} is on the way to you.`,
  },
  delivered: {
    title: 'Order delivered!',
    body: (n) => `Order ${n} has been delivered. Enjoy your meal!`,
  },
  cancelled: {
    title: 'Order cancelled',
    body: (n) => `Order ${n} was cancelled.`,
  },
};

/** Validate promo code against eligibility rules. Returns discount amount. */
export async function computePromoDiscount(
  promoCode: string | undefined,
  subtotal: number,
  customerId: string,
): Promise<number> {
  if (!promoCode) return 0;
  const promo = await PromotionModel.findOne({
    code: promoCode.toUpperCase(),
    active: true,
  });
  if (!promo) throw new AppError('Invalid promo code', 422);
  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) throw new AppError('Promo is not active yet', 422);
  if (promo.expiresAt && promo.expiresAt < now) throw new AppError('Promo has expired', 422);
  if (subtotal < (promo.minOrder ?? 0)) {
    throw new AppError(`Promo requires a minimum order of Rs ${promo.minOrder}`, 422);
  }
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    throw new AppError('Promo code usage limit reached', 422);
  }
  if (
    promo.audience?.type === 'specific_users' &&
    !(promo.audience.userIds ?? []).includes(customerId)
  ) {
    throw new AppError('Promo is not available to your account', 422);
  }
  if (promo.audience?.type === 'new_customers') {
    const hasPastOrders = await OrderModel.exists({ customer: customerId });
    if (hasPastOrders) throw new AppError('Promo is for new customers only', 422);
  }

  const discount = promo.type === 'flat' ? promo.value : Math.round((subtotal * promo.value) / 100);
  const capped = promo.maxDiscount ? Math.min(discount, promo.maxDiscount) : discount;
  return Math.min(capped, subtotal);
}

/** Rebuilds cart prices from the DB (server-authoritative) for a given user. */
export async function buildCartWithPricing(userId: string) {
  const cart = await CartModel.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }
  const restaurant = await RestaurantModel.findById(cart.restaurant);
  if (!restaurant) throw new AppError('Restaurant for this cart no longer exists', 400);

  // Rehydrate items from current DB pricing — never trust cart.price.
  const ids = cart.items.map((i) => i.foodItem);
  const foodItems = await FoodItemModel.find({ _id: { $in: ids }, deletedAt: null });
  const priceMap = new Map(foodItems.map((f) => [String(f._id), f]));

  const items = cart.items.map((item) => {
    const food = priceMap.get(String(item.foodItem));
    if (!food || !(food as any).available) {
      throw new AppError(`Item "${item.name}" is no longer available`, 400);
    }
    // A cart holds one restaurant. An item from another restaurant would be
    // prepared by the wrong kitchen and billed at the wrong price, so reject it.
    if (String((food as any).restaurant) !== String(restaurant._id)) {
      throw new AppError(`Item "${(food as any).name}" belongs to a different restaurant`, 400);
    }
    // Quantities are re-derived, not trusted: a negative or fractional quantity
    // would silently reduce (or inflate) the amount charged.
    const quantity = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      throw new AppError(`Item "${(food as any).name}" has an invalid quantity`, 400);
    }
    return {
      foodItem: (food as any)._id,
      name: (food as any).name,
      quantity,
      price: (food as any).price,
      emoji: (food as any).emoji ?? item.emoji,
      gradient: (food as any).gradient ?? item.gradient,
      note: item.note,
    };
  });

  const subtotal = items.reduce(
    (sum: number, i: any) => sum + (i.price || 0) * (i.quantity || 0),
    0,
  );
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    throw new AppError('Your cart total must be greater than zero', 400);
  }
  return { cart, restaurant, items, subtotal };
}

type CartWithPricing = Awaited<ReturnType<typeof buildCartWithPricing>>;
type OrderTotals = Awaited<ReturnType<typeof computeOrderTotals>>;
/**
 * Mongoose documents (as opposed to the lean `Order`/`Payment` types), needed
 * wherever a service still mutates and saves after creation.
 */
type OrderDoc = Doc<Order>;
type PaymentDoc = Doc<Payment>;

/**
 * Computes every monetary field for a prospective order from database pricing.
 *
 * This is deliberately separate from `placeOrder` so the checkout screen can show
 * a server-authoritative quote (delivery fee, discount, platform fee, total)
 * without creating an order — and so the quoted total and the charged total
 * cannot drift apart.
 */
export async function computeOrderTotals(
  customerId: string,
  options: { promoCode?: string; tip?: number; redeemPoints?: number } = {},
) {
  const { cart, restaurant, items, subtotal } = await buildCartWithPricing(customerId);

  const discount = await computePromoDiscount(options.promoCode, subtotal, customerId);

  // Loyalty redemption: quoted against the caller's REAL balance, then capped
  // by the settings (Rs/point, max % of subtotal). The authoritative debit is
  // a compare-and-set in placeOrder, so an overdraw between quote and purchase
  // still fails safely.
  const loyaltyConfig = await getLoyaltyConfig();
  const balance =
    options.redeemPoints && options.redeemPoints > 0
      ? await loyaltyBalanceFor(customerId)
      : 0;
  const { points: loyaltyPointsRedeemed, discount: loyaltyDiscount } = pointsDiscountFor(
    Math.min(options.redeemPoints ?? 0, balance),
    subtotal,
    loyaltyConfig,
  );

  const baseDeliveryFee = restaurant.freeDelivery ? 0 : (restaurant.deliveryFee ?? 0);
  const deliveryFee =
    restaurant.freeDelivery && subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : baseDeliveryFee;

  const platformFee = (await getSetting<number>('platform_fee')) ?? PLATFORM_FEE;
  // Guard here as well as at the route: `computeOrderTotals` is reachable from
  // several callers, and a NaN total would be persisted as a "valid" order.
  const tip = Math.max(0, Number.isFinite(options.tip) ? (options.tip as number) : 0);
  const total =
    subtotal + deliveryFee + platformFee - discount - loyaltyDiscount + tip;
  if (!Number.isFinite(total) || total <= 0) {
    throw new AppError('Order total must be a positive amount', 400);
  }

  return {
    cart,
    restaurant,
    items,
    subtotal,
    deliveryFee,
    discount,
    platformFee,
    tip,
    loyaltyPointsRedeemed,
    loyaltyDiscount,
    total,
    distanceKm: restaurant.deliveryKM ?? 0,
    estimatedMinutes: restaurant.prepTimeMin ?? restaurant.deliveryTimeMin ?? 30,
  };
}

/**
 * Tell every active admin that a new order exists. Persisted in-app rows are
 * deliberate even if no admin device has a push token, so the order still shows
 * up in the admin notification list. Failures are swallowed: an admin alert
 * must never fail a customer's checkout.
 */
export async function notifyAdminsNewOrder(order: OrderDoc): Promise<void> {
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
          event: 'order_placed',
          refId: String(order._id),
          title: 'New order received',
          body: `Order ${order.orderNumber} for Rs ${order.total} is waiting for the restaurant.`,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            status: order.status,
          },
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Admin alerting is best-effort.
  }
}

/**
 * Notify the restaurant owner of an order event (new order / lifecycle step /
 * cancellation). The owner account is resolvable through the restaurant's
 * `ownerUser`; failures are swallowed so an owner alert can never break a
 * customer-facing flow.
 */
async function notifyRestaurantOwner(
  order: { _id?: unknown; restaurant: unknown; orderNumber?: string | null; status?: string },
  event: NotificationEvent,
  title: string,
  body: string,
): Promise<void> {
  try {
    const restaurant = await RestaurantModel.findById(order.restaurant)
      .select('ownerUser name')
      .lean();
    if (!restaurant?.ownerUser) return;
    await notifyUser(String(restaurant.ownerUser), {
      type: 'order',
      event,
      refId: String(order._id ?? ''),
      title,
      body,
      data: {
        orderId: String(order._id ?? ''),
        orderNumber: order.orderNumber ?? '',
        status: order.status ?? '',
      },
    });
  } catch {
    // Owner alerting is best-effort.
  }
}

/**
 * placeOrder — creates the Order, computes totals server-side, records the
 * payment intent and clears the cart.
 *
 * For online gateways the order is created in an UNPAID state and the caller is
 * responsible for calling `initiateOnlinePayment`. The customer is only notified
 * once the payment is verified, so a failed/abandoned payment never produces a
 * "your order is in the kitchen" push.
 *
 * Idempotency: a retried request that carries the same `idempotencyKey` returns
 * the order created by the first attempt instead of creating a second one. The
 * payment row is written before any money moves and its unique index on
 * `idempotencyKey` is what arbitrates a race between two concurrent attempts.
 */
export async function placeOrder(input: {
  customerId: string;
  addressId: string;
  paymentMethod: OrderCheckoutMethod;
  promoCode?: string;
  tip?: number;
  note?: string;
  idempotencyKey?: string;
  /** Loyalty redemption requested at checkout (see loyalty.service). */
  redeemPoints?: number;
  /** Scheduled delivery slot (ISO string; validated against lead/window). */
  scheduledFor?: string | null;
}): Promise<{ order: OrderDoc; payment: PaymentDoc }> {
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

  // Scheduled delivery validation happens up-front: rejecting an impossible
  // slot must never burn an idempotency lock or debit any points.
  let scheduledAt: Date | null = null;
  if (input.scheduledFor) {
    const parsed = new Date(input.scheduledFor);
    const scheduleError = scheduledForError(parsed);
    if (scheduleError) throw new AppError(scheduleError, 422);
    scheduledAt = parsed;
  }

  // Fast replay: this attempt already completed (or is completing).
  let reusablePayment: PaymentDoc | null = null;
  if (idempotencyKey) {
    const existing = await PaymentModel.findOne({
      idempotencyKey,
      user: input.customerId,
    });
    if (existing) {
      const replay = await replayExistingPayment(existing);
      if (replay) return replay;
      // A wallet row without an order may already have debited the balance, so
      // it is never reused: doing so could charge the customer twice. A
      // non-pending row (paid/failed/cancelled) belongs to a finished attempt.
      if (existing.method === 'wallet' || existing.status !== 'pending') {
        throw CONFLICT(
          'A previous checkout attempt is still being processed. Please check your orders before trying again.',
        );
      }
      reusablePayment = existing;
    }
  }

  const totals = await computeOrderTotals(input.customerId, {
    promoCode: input.promoCode,
    tip: input.tip,
    redeemPoints: input.redeemPoints,
  });
  const {
    cart,
    restaurant,
    items,
    subtotal,
    deliveryFee,
    discount,
    platformFee,
    total,
    loyaltyPointsRedeemed,
    loyaltyDiscount,
  } = totals;

  // A balance check + CAS debit before anything else moves: two concurrent
  // checkouts cannot both spend the same points, and an overdraw can never
  // survive into an order.
  if (loyaltyPointsRedeemed > 0) {
    await assertRedeemable(input.customerId, loyaltyPointsRedeemed);
    await debitLoyaltyPoints(input.customerId, loyaltyPointsRedeemed);
  }

  const address = await AddressModel.findOne({
    _id: input.addressId,
    user: input.customerId,
    deletedAt: null,
  });
  if (!address) throw NOT_FOUND('Delivery address');

  const method = input.paymentMethod;

  // The reused row must still describe the same money; a cart edit between
  // attempts invalidates the idempotent replay.
  if (reusablePayment && reusablePayment.amount !== total) {
    throw CONFLICT('Your cart changed while checkout was in progress. Please review it and retry.');
  }

  let paymentStatus: PaymentStatus = 'pending';
  const initialPaymentStatus: Payment['status'] = 'pending';

  let payment: PaymentDoc;
  if (reusablePayment) {
    payment = reusablePayment;
  } else {
    try {
      // Written BEFORE anything else: this row is the idempotency lock.
      // Direct transfers are not a gateway: `manual` keeps the row out of the
      // gateway verify paths — only an admin decision may settle it.
      payment = await PaymentModel.create({
        user: input.customerId,
        kind: 'order',
        method,
        status: initialPaymentStatus,
        amount: total,
        currency: 'PKR',
        gateway: 'manual',
        initiatedAt: null,
        idempotencyKey: idempotencyKey ?? null,
      });
    } catch (error) {
      // Lost a race against a concurrent retry: the winner's row now exists.
      if (idempotencyKey) {
        const winner = await PaymentModel.findOne({
          idempotencyKey,
          user: input.customerId,
        });
        if (winner) {
          const replay = await replayExistingPayment(winner);
          if (replay) return replay;
        }
      }
      throw error;
    }
  }

  // No up-front debit happens for a direct transfer: the money moves by hand,
  // the payment stays `pending` (an admin later flips it to `paid`), and the
  // order stays `pending` until the verification completes.
  try {
    return await finaliseOrder({
      input,
      restaurant,
      address,
      items,
      subtotal,
      deliveryFee,
      discount,
      platformFee,
      total,
      totals,
      payment,
      paymentStatus,
      method,
      scheduledFor: scheduledAt,
      loyaltyPointsRedeemed,
      loyaltyDiscount,
    });
  } catch (error) {
    // Order creation failed after the payment row was written.
    if (loyaltyPointsRedeemed > 0) {
      // Points were consumed for an order that does not exist — give them back
      // so a retry does not spend them twice.
      await refundLoyaltyPoints(input.customerId, loyaltyPointsRedeemed).catch(() => undefined);
    }
    // Nothing was charged: drop the lock so a retry can proceed.
    await PaymentModel.deleteOne({ _id: payment._id }).catch(() => undefined);
    throw error;
  }
}

/**
 * If a payment row already owns an order, hand back that pair so a retry is a
 * pure replay. Returns null when the row is still mid-flight.
 */
async function replayExistingPayment(
  payment: PaymentDoc,
): Promise<{ order: OrderDoc; payment: PaymentDoc } | null> {
  if (!payment.order) return null;
  const order = await OrderModel.findById(payment.order);
  if (!order) return null;
  return { order, payment };
}

/** Shared order-creation tail for every payment method. */
async function finaliseOrder(args: {
  input: { customerId: string; promoCode?: string; tip?: number; note?: string };
  restaurant: CartWithPricing['restaurant'];
  /** Resolved delivery address; already ownership-checked by the caller. */
  address: {
    full: string;
    area?: string | null;
    lat?: number | null;
    lng?: number | null;
    tag?: string | null;
  };
  items: CartWithPricing['items'];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  platformFee: number;
  total: number;
  totals: OrderTotals;
  payment: PaymentDoc;
  paymentStatus: PaymentStatus;
  method: OrderCheckoutMethod;
  scheduledFor: Date | null;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
}): Promise<{ order: OrderDoc; payment: PaymentDoc }> {
  const {
    input,
    restaurant,
    address,
    items,
    subtotal,
    deliveryFee,
    discount,
    platformFee,
    total,
    totals,
  } = args;

  const order = await OrderModel.create({
    customer: input.customerId,
    restaurant: restaurant._id,
    items,
    status: 'pending',
    statusHistory: [{ status: 'pending', note: 'Order placed' }],
    addressSnapshot: {
      full: address.full,
      area: address.area,
      lat: address.lat,
      lng: address.lng,
      tag: address.tag,
    },
    subtotal,
    deliveryFee,
    discount,
    platformFee,
    total,
    distanceKm: totals.distanceKm,
    estimatedMinutes: totals.estimatedMinutes,
    paymentMethod: args.method,
    paymentStatus: args.paymentStatus,
    payment: args.payment._id,
    scheduledFor: args.scheduledFor,
    tip: args.totals.tip,
    loyaltyPointsRedeemed: args.loyaltyPointsRedeemed,
    loyaltyDiscount: args.loyaltyDiscount,
    paymentGateway: 'manual',
    riderPayout: Math.round((deliveryFee + platformFee) * RIDER_PAYOUT_RATE),
    note: input.note,
  });

  order.orderNumber = humanId('SWT', String(order._id));
  await order.save();

  // Pay-side backlink: the payment points AT its order. The old per-method
  // flows wrote this on payment creation; the unified tail must keep it, or
  // idempotent replays (`same idempotencyKey → same order`) can never find the
  // original attempt and a double-clicked checkout dies on "cart is empty".
  args.payment.order = String(order._id);
  await args.payment.save();

  await OrderItemModel.insertMany(
    items.map((i) => ({
      order: order._id,
      foodItem: i.foodItem,
      restaurant: restaurant._id,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      emoji: i.emoji,
      note: i.note,
    })),
  );

  // Clear the cart
  totals.cart.set('items', []);
  totals.cart.subtotal = 0;
  totals.cart.restaurant = undefined;
  await totals.cart.save();

  // Direct bank/wallet transfer: tell the customer to move the money and
  // submit proof. NO admin/restaurant alert and no kitchen action yet — the
  // order stays unconfirmed until an admin verifies the transfer, and the
  // payment-proof submission (not this message) opens the verification queue.
  const channel = manualChannelForMethod(args.method) ?? 'ubl';
  const destination =
    channel === 'ubl'
      ? 'the UBL account shown on the next screen'
      : channel === 'easypaisa'
        ? 'the Easypaisa account shown on the next screen'
        : 'the JazzCash account shown on the next screen';
  await notifyUser(input.customerId, {
    type: 'order',
    event: 'order_placed',
    refId: String(order._id),
    title: 'Transfer the order amount now',
    body: `Order ${order.orderNumber}: send Rs ${order.total} to ${destination}, then submit the transaction ID + receipt screenshot. The order is confirmed only after admin verification of the transfer.`,
    data: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      transferChannel: channel,
    },
  }).catch(() => undefined);

  return { order, payment: args.payment };
}

export async function getOrderForUser(orderId: string, userId: string): Promise<Order> {
  const order = await OrderModel.findOne({ _id: orderId }).populate(
    'customer restaurant rider',
    'name phone email avatarUrl role',
  );
  if (!order) throw NOT_FOUND('Order');
  if (String(order.customer) !== userId)
    throw new AppError('You can only access your own orders', 403);
  return order;
}

/** Advance an order lifecycle state with full transition validation. */
export async function advanceOrderStatus(
  orderId: string,
  to: OrderStatus,
  actorId = 'system',
  source: 'admin' | 'restaurant' | 'system' = 'admin',
): Promise<Order> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  const from = order.status;
  if (!canTransition(from, to)) {
    throw CONFLICT(transitionError(from, to));
  }

  // THE payment gate on confirmation. Checkout is never "complete" the moment
  // an order is created — the kitchen may not be told about money that has not
  // actually moved. A manual-transfer order whose proof is still
  // `pending_verification` (or was rejected by an admin) cannot be confirmed;
  // the moment a verified admin approves the payment, this gate re-opens by
  // itself. Cash on delivery is the exception by design: it settles at the
  // door, so `pending` + `cash` is a legitimately confirmable state.
  if (to === 'confirmed' && !paymentEligible(order)) {
    throw CONFLICT(
      isManualTransferMethod(order.paymentMethod)
        ? 'This order cannot be confirmed until its payment is approved. Verify the transfer receipt first.'
        : 'This order cannot be confirmed until its payment shows as paid.',
    );
  }

  // Compare-and-set on the status: of two concurrent requests (double-tap,
  // retry) only one matches {_id, status: from} and performs the move; the
  // loser gets a conflict instead of re-running the transition — and its
  // payout / refund side effects — a second time.
  const updated = await OrderModel.findOneAndUpdate(
    { _id: orderId, status: from },
    { $set: { status: to, previousStatus: from } },
    { new: true },
  );
  if (!updated) throw CONFLICT('Order status changed concurrently. Refresh and try again.');

  updated.statusHistory.push({
    status: to,
    note: `Status updated to ${to} by ${source}`,
  });
  await updated.save();

  // Scope the live update to the people the order belongs to. A global
  // `io.emit` leaked every order's status (and its order number) to every
  // connected customer and rider on the platform.
  const io = getIO();
  const statusPayload = {
    orderId,
    orderNumber: updated.orderNumber,
    status: to,
    timestamp: new Date().toISOString(),
  };
  io.to(`user:${String(updated.customer)}`).emit(SOCKET_EVENTS.orderStatus, statusPayload);
  io.to('role:admin').emit(SOCKET_EVENTS.orderStatus, statusPayload);
  if (updated.rider) {
    io.to(`user:${String(updated.rider)}`).emit(SOCKET_EVENTS.orderStatus, statusPayload);
  }
  // Riders watching the open feed need to know a job just became available.
  if (to === 'ready' && !updated.rider) {
    io.to('role:rider').emit(SOCKET_EVENTS.orderStatus, statusPayload);
  }
  // Customer gets a routed push for every lifecycle step, not just delivery.
  const restaurantName = String(
    (await RestaurantModel.findById(updated.restaurant).select('name').lean())?.name ??
      'the restaurant',
  );
  const copy = ORDER_STATUS_COPY[to];

  // ETA push (single, never per GPS tick): the moment the rider turns
  // `on_the_way` their last known position → the delivery address is a
  // meaningful estimate. Computed once from the throttled rider-profile fix,
  // appended to the status push — no extra notification is created.
  let etaSuffix = '';
  if (to === 'on_the_way' && updated.rider) {
    try {
      const profile = await RiderProfileModel.findOne({ user: String(updated.rider) })
        .select('lastLocation')
        .lean();
      const from = profile?.lastLocation?.lat != null && profile?.lastLocation?.lng != null
        ? { lat: profile.lastLocation.lat as number, lng: profile.lastLocation.lng as number }
        : null;
      const dest =
        updated.addressSnapshot?.lat != null && updated.addressSnapshot?.lng != null
          ? {
              lat: updated.addressSnapshot.lat as number,
              lng: updated.addressSnapshot.lng as number,
            }
          : null;
      if (from && dest) {
        const km = haversineKm(from, dest);
        const minutes = Math.max(1, Math.round((km / 22) * 60));
        etaSuffix = ` Arriving in about ${minutes} min (${km.toFixed(1)} km away).`;
      }
    } catch {
      // ETA is cosmetic; the push still goes out without it.
    }
  }

  await notifyUser(String(updated.customer), {
    type: 'order',
    event: ORDER_STATUS_EVENTS[to],
    refId: String(updated._id),
    title: copy.title,
    body: copy.body(updated.orderNumber ?? '', restaurantName) + etaSuffix,
    data: {
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      status: to,
      ...(to === 'on_the_way' && etaSuffix ? { etaPush: true } : {}),
    },
  });

  // The rider needs to know the moment an order is ready to collect.
  if (to === 'ready' && updated.rider) {
    await notifyUser(String(updated.rider), {
      type: 'order',
      event: 'order_ready',
      refId: String(updated._id),
      title: 'New order ready for pickup',
      body: `Order ${updated.orderNumber} at ${restaurantName} is ready to collect.`,
      data: { orderId: String(updated._id), orderNumber: updated.orderNumber, status: to },
    });
  }

  // No rider assigned yet: hand the order to the dispatch service. It gates on
  // payment eligibility, offers the order to every approved online rider
  // (private-room socket offer + Expo push) and re-broadcasts expired rounds —
  // so an unclaimed order is retried instead of silently sitting in the feed.
  if (to === 'ready' && !updated.rider) {
    void dispatchOrder(String(updated._id));
  }

  // The restaurant owner follows the order while it is in their kitchen;
  // pickup / delivery steps are rider + customer concerns.
  if (to === 'confirmed' || to === 'preparing' || to === 'rider_assigned') {
    await notifyRestaurantOwner(
      updated,
      ORDER_STATUS_EVENTS[to],
      copy.title,
      copy.body(updated.orderNumber ?? '', restaurantName),
    ).catch(() => undefined);
  }

  // Delivered settles the engagement side-effects: loyalty points earn into
  // the customer's balance and a referral bonus pays out on the referee's
  // first delivered order. Both are ledger/idempotent and must never break the
  // transition itself, so failures are contained here.
  if (to === 'delivered') {
    try {
      const earned = await awardLoyaltyPoints({
        _id: updated._id,
        customer: updated.customer,
        subtotal: updated.subtotal,
        loyaltyPointsEarned: updated.loyaltyPointsEarned,
      });
      if (earned > 0) {
        await OrderModel.updateOne(
          { _id: updated._id },
          { $set: { loyaltyPointsEarned: earned } },
        ).catch(() => undefined);
        await notifyUser(String(updated.customer), {
          type: 'order',
          event: 'order_delivered',
          refId: String(updated._id),
          title: `+${earned} loyalty points earned`,
          body: `You earned ${earned} loyalty points on order ${updated.orderNumber}. Spend them at checkout.`,
          data: { orderId: String(updated._id), orderNumber: updated.orderNumber, status: to },
        }).catch(() => undefined);
      }
    } catch {
      // Loyalty best-effort.
    }
    try {
      await awardReferralOnDelivered({
        _id: updated._id,
        orderNumber: updated.orderNumber,
        customer: updated.customer,
        status: 'delivered',
      });
    } catch {
      // Referral best-effort.
    }
    try {
      // The rider finished their leg: give the slot back if nothing else is
      // holding them busy, so they become available for the next offer round.
      if (updated.rider) {
        await revertRiderStatusIfIdle(String(updated.rider));
      }
    } catch {
      // Status cosmetics — best-effort.
    }
  }

  return updated;
}

/**
 * Assign an approved rider to an order and emit rider-assigned live.
 *
 * Two entry paths, deliberately separated:
 *   - `ready` + unclaimed: the assignment goes through `claimRiderOrder` — the
 *     same atomic SQL statement the rider Accept endpoint uses — so a racing
 *     rider or racing admin can never double-assign, and the payment gate
 *     (admin-verified money / cash) is enforced in the database itself.
 *   - admin early-dispatch (`allowEarly`, pending/confirmed): the legacy CAS
 *     apply is kept, because the kitchen has not packed the order yet and the
 *     admin is explicitly overriding the queue order.
 */
export async function assignRiderToOrder(
  orderId: string,
  riderUserId: string,
  options: { allowEarly?: boolean } = {},
): Promise<Order> {
  // A pending / rejected rider must never be able to take a job.
  await assertRiderApproved(riderUserId);

  const existing = await OrderModel.findById(orderId);
  if (!existing) throw NOT_FOUND('Order');

  if (existing.status === 'ready' && !existing.rider) {
    // Atomic first-accept-wins claim (also enforces one-active-delivery and
    // payment eligibility inside Postgres and flips the rider to `busy`).
    const outcome = await claimRiderOrder(riderUserId, orderId);
    if (outcome === 'rider_busy') {
      throw CONFLICT('Finish your active delivery first — one delivery at a time.');
    }
    if (outcome === 'rider_not_approved') {
      throw CONFLICT('Rider account is not approved for assignment');
    }
    if (outcome !== 'accepted') {
      throw CONFLICT('This order is no longer available — it may already have a rider.');
    }
    const claimed = (await OrderModel.findById(orderId)) as Order;
    await fanOutRiderAssigned(claimed, riderUserId);
    return claimed;
  }

  const order = existing;
  if (!canAssignRider(order.status, options.allowEarly)) {
    throw CONFLICT(
      options.allowEarly
        ? 'Order is not ready for rider assignment'
        : 'This order is not ready for pickup yet',
    );
  }
  if (order.rider) throw CONFLICT('An rider is already assigned to this order');

  // THE payment gate for early assignment. The open-feed path enforces this in
  // `dispatchOrder` + the SQL `accept_rider_order` claim, and this is the same
  // rule applied to the panel's assign button: no rider may be attached while
  // the money is unverified — a pending/rejected manual transfer, or any
  // non-cash order whose payment was never settled.
  if (!paymentEligible(order)) {
    throw CONFLICT(
      'The payment must be approved by an admin before a rider can be assigned to this order',
    );
  }

  order.rider = riderUserId;
  order.status = 'rider_assigned';
  order.statusHistory.push({ status: 'rider_assigned', note: `Rider ${riderUserId} assigned` });
  order.riderPayout = Math.round((order.deliveryFee + order.platformFee) * RIDER_PAYOUT_RATE);
  await order.save();

  // The order left the open pool the moment it was claimed: clear any pending
  // offer rounds for it.
  await stopDispatchForOrder(String(order._id), 'assigned').catch(() => undefined);

  await fanOutRiderAssigned(order, riderUserId);
  return order;
}

/** Socket + notification fan-out shared by both assignment paths. */
async function fanOutRiderAssigned(order: Order, riderUserId: string): Promise<void> {
  const io = getIO();
  io.to(`user:${riderUserId}`).emit(SOCKET_EVENTS.orderRiderAssigned, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    message: 'New delivery assigned',
  });

  const restaurantName = String(
    (await RestaurantModel.findById(order.restaurant).select('name').lean())?.name ??
      'the restaurant',
  );

  await notifyUser(String(order.customer), {
    type: 'order',
    event: 'rider_assigned',
    refId: String(order._id),
    title: 'Rider assigned',
    body: `A rider has been assigned to order ${order.orderNumber} and is heading to the restaurant.`,
    data: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
  }).catch(() => undefined);

  // And the rider gets a push, not just a socket event.
  await notifyUser(riderUserId, {
    type: 'order',
    event: 'rider_assigned',
    refId: String(order._id),
    title: 'New delivery assigned',
    body: `Collect order ${order.orderNumber} from ${restaurantName}.`,
    data: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
  }).catch(() => undefined);
}

export async function cancelOrder(input: {
  orderId: string;
  actorId: string;
  by: 'customer' | 'rider' | 'restaurant' | 'admin' | 'system';
  reason: string;
}): Promise<Order> {
  // A blank or one-character reason would leave "why was this cancelled?"
  // questions unanswerable — enforce a minimum at the server gate.
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw CONFLICT('Please give a clear cancellation reason (at least 3 characters).');
  }

  const order = await OrderModel.findById(input.orderId);
  if (!order) throw NOT_FOUND('Order');
  if (order.status === 'cancelled' || order.status === 'delivered') {
    throw CONFLICT(`Order is already ${order.status}`);
  }

  const cancelableUpTo: OrderStatus[] = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'rider_assigned',
  ];
  if (input.by === 'customer' && !cancelableUpTo.includes(order.status)) {
    throw CONFLICT('Order can no longer be cancelled at this stage');
  }

  const restaurantName = String(
    (await RestaurantModel.findById(order.restaurant).select('name').lean())?.name ??
      'The restaurant',
  );

  // Captured BEFORE the status flips, otherwise previousStatus would just be
  // 'cancelled' and the reject-vs-cancel distinction below is impossible.
  const statusBeforeCancel = order.status;

  // Compare-and-set: a concurrent duplicate cancellation finds the status
  // already changed and gets a conflict instead of running the refund leg
  // (and the notify fan-out) twice.
  const cancelled = await OrderModel.findOneAndUpdate(
    { _id: input.orderId, status: statusBeforeCancel },
    {
      $set: {
        status: 'cancelled',
        previousStatus: statusBeforeCancel,
        cancelReason: reason,
        cancelledBy: input.by,
      },
    },
    { new: true },
  );
  if (!cancelled) throw CONFLICT('Order changed concurrently. Refresh and try again.');

  // Dispatch bookkeeping: if the order was still being offered to riders it
  // just left the pool — clear every pending offer so riders stop seeing it.
  // If a rider already held the order, hand their availability back once no
  // other job is keeping them busy.
  if (cancelled.rider) {
    await revertRiderStatusIfIdle(String(cancelled.rider)).catch(() => undefined);
  } else {
    await stopDispatchForOrder(String(cancelled._id), 'cancelled').catch(() => undefined);
  }

  cancelled.statusHistory.push({
    status: 'cancelled',
    note: `Cancelled by ${input.by}: ${reason}`,
  });
  await cancelled.save();

  // Captured before either refund branch runs: the branches below re-assign
  // `paymentStatus`, which would break the second check by narrowing.
  const wasPaid = cancelled.paymentStatus === 'paid';

  // Points were spent into this order and the food never arrived: refund the
  // redeemed loyalty points so the balance is whole again. The single CAS
  // transition above guarantees exactly one refund per order.
  if ((cancelled.loyaltyPointsRedeemed ?? 0) > 0) {
    await refundLoyaltyPoints(String(cancelled.customer), cancelled.loyaltyPointsRedeemed ?? 0).catch(
      () => undefined,
    );
  }

  // Refund wallet payments that were already debited at placement.
  if (wasPaid && cancelled.paymentMethod === 'wallet') {
    // Ledger-level idempotency: the refund description names the unique order
    // number, so a raced duplicate sees the first refund row and skips instead
    // of crediting the customer twice.
    const refundDescription = `Refund for cancelled order ${cancelled.orderNumber}`;
    const alreadyRefunded = await WalletTransactionModel.findOne({
      user: String(cancelled.customer),
      type: 'refund',
      description: refundDescription,
    });
    if (!alreadyRefunded) {
      await creditWallet(String(cancelled.customer), cancelled.total, 'refund', {
        reference: 'order',
        referenceModel: 'Order',
        description: refundDescription,
        byUser: input.actorId,
      });
    }
    cancelled.paymentStatus = 'refunded';
    await cancelled.save();
    await PaymentModel.updateOne({ _id: cancelled.payment }, { $set: { status: 'refunded' } });
  }

  // Verified MANUAL-TRANSFER payments (UBL / Easypaisa / JazzCash transfer)
  // cannot be returned automatically: the money must be sent back to the
  // account the customer paid from, which only a human can do from the bank
  // app. Mark the money refunded-on-ledger and put the task on the admin team.
  if (wasPaid && cancelled.paymentMethod !== 'wallet' && isManualTransferMethod(String(cancelled.paymentMethod))) {
    cancelled.paymentStatus = 'refunded';
    await cancelled.save();
    await PaymentModel.findOneAndUpdate(
      { _id: cancelled.payment },
      { $set: { status: 'refunded', refundedAt: new Date() } },
    );
    await notifyAdminsRefundRequired(cancelled, reason, input.by);
  }

  // Rejected before the kitchen ever accepted it; cancelled afterwards.
  const rejectedEarly = statusBeforeCancel === 'pending';
  const refundedToWallet =
    cancelled.paymentStatus === 'refunded' && cancelled.paymentMethod === 'wallet';
  const manualRefundPending =
    cancelled.paymentStatus === 'refunded' && cancelled.paymentMethod !== 'wallet';
  await notifyUser(String(cancelled.customer), {
    type: 'order',
    event: rejectedEarly ? 'order_rejected' : 'order_cancelled',
    refId: String(cancelled._id),
    title: rejectedEarly ? 'Order rejected' : 'Order cancelled',
    body: rejectedEarly
      ? `${restaurantName} could not take order ${cancelled.orderNumber}.${
          refundedToWallet
            ? ' Amount refunded to your wallet.'
            : manualRefundPending
              ? ' Your transfer refund has been queued — our team will send the money back to your paying account.'
              : ''
        }`
      : `Your order ${cancelled.orderNumber} was cancelled.${
          refundedToWallet
            ? ' Amount refunded to your wallet.'
            : manualRefundPending
              ? ' Your transfer refund has been queued — the admin team will return it to your paying account.'
              : ''
        }`,
    data: {
      orderId: String(cancelled._id),
      orderNumber: cancelled.orderNumber,
      status: 'cancelled',
      paymentStatus: String(cancelled.paymentStatus),
    },
  });

  // Keep the rider informed if they were already holding this order.
  if (cancelled.rider) {
    await notifyUser(String(cancelled.rider), {
      type: 'order',
      event: 'order_cancelled',
      refId: String(cancelled._id),
      title: 'Delivery cancelled',
      body: `Order ${cancelled.orderNumber} was cancelled. Please ignore it.`,
      data: { orderId: String(cancelled._id), orderNumber: cancelled.orderNumber, status: 'cancelled' },
    });
  }

  // Tell the restaurant owner when someone else cancelled one of their orders
  // (customer cancel while pending, admin, or system payment failure).
  if (input.by !== 'restaurant') {
    await notifyRestaurantOwner(
      cancelled,
      'order_cancelled',
      'Order cancelled',
      `Order ${cancelled.orderNumber} was cancelled (${input.by}). Reason: ${reason}`,
    ).catch(() => undefined);
  }

  return cancelled;
}

/**
 * A cancelled order whose money came in as a manual transfer cannot refund
 * itself: the return leg is a human banking action. Every active admin gets a
 * task-style alert so the payout never relies on somebody noticing a ledger row.
 */
async function notifyAdminsRefundRequired(
  cancelled: OrderDoc,
  reason: string,
  by: string,
): Promise<void> {
  try {
    const admins = await UserModel.find({ role: 'admin', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    await Promise.all(
      admins.map((admin) =>
        notifyUser(String(admin._id), {
          type: 'order',
          event: 'order_cancelled',
          refId: String(cancelled._id),
          title: 'Manual transfer refund required',
          body: `Order ${cancelled.orderNumber} (Rs ${cancelled.total}, paid by ${cancelled.paymentMethod}) was cancelled by ${by}. Send the refund back to the customer's paying account. Reason: ${reason}`,
          data: {
            orderId: String(cancelled._id),
            orderNumber: cancelled.orderNumber,
            paymentStatus: 'refunded',
            refundRequired: true,
          },
        }).catch(() => undefined),
      ),
    );
  } catch {
    // The refund alert is best-effort; the payment is already marked refunded.
  }
}

export async function markOrderPaidOnDelivery(orderId: string): Promise<Order> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  if (order.status !== 'delivered') throw CONFLICT('Order must be delivered before marking paid');
  if (order.paymentMethod === 'wallet') throw CONFLICT('Wallet orders are paid at placement');
  if (order.paymentStatus === 'paid') return order;

  order.paymentStatus = 'paid';
  await order.save();
  await PaymentModel.updateOne({ _id: order.payment }, { $set: { status: 'paid' } });
  return order;
}

/** Rider completes a delivery → pays out earnings into the rider wallet. */
export async function payRiderEarnings(orderId: string, riderId: string): Promise<Order> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  if (order.status !== 'delivered') throw CONFLICT('Order must be delivered before payout');
  if (String(order.rider) !== riderId)
    throw new AppError('Only the assigned rider can be paid', 403);
  if (order.riderPayout <= 0) throw new AppError('No payout available for this order', 400);

  // Ledger-level idempotency: the earnings row is named after the unique order
  // number, so a retried or raced completion sees the first credit and skips
  // instead of paying the rider twice.
  const description = `Earnings for delivery ${order.orderNumber}`;
  const alreadyPaid = await WalletTransactionModel.findOne({
    user: riderId,
    type: 'earning',
    description,
  });
  if (alreadyPaid) return order;

  await getOrCreateWallet(riderId, true);
  await creditWallet(riderId, order.riderPayout, 'earning', {
    reference: 'order',
    referenceModel: 'Order',
    description,
    metadata: { orderId: String(order._id) },
  });
  return order;
}
