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
import { creditWallet, debitWallet, getOrCreateWallet } from './wallet.service';
import { assertRiderApproved } from './riderApproval.service';
import { getIO, isSocketReady, SOCKET_EVENTS } from '../sockets';
import { AppError, BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { humanId } from '../utils/tokens';
import { getSetting } from './settings.service';
import { canAssignRider } from '../utils/orderPolicy';

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
  options: { promoCode?: string; tip?: number } = {},
) {
  const { cart, restaurant, items, subtotal } = await buildCartWithPricing(customerId);

  const discount = await computePromoDiscount(options.promoCode, subtotal, customerId);
  const baseDeliveryFee = restaurant.freeDelivery ? 0 : (restaurant.deliveryFee ?? 0);
  const deliveryFee =
    restaurant.freeDelivery && subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : baseDeliveryFee;

  const platformFee = (await getSetting<number>('platform_fee')) ?? PLATFORM_FEE;
  // Guard here as well as at the route: `computeOrderTotals` is reachable from
  // several callers, and a NaN total would be persisted as a "valid" order.
  const tip = Math.max(0, Number.isFinite(options.tip) ? (options.tip as number) : 0);
  const total = subtotal + deliveryFee + platformFee - discount + tip;
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
    total,
    distanceKm: restaurant.deliveryKM ?? 0,
    estimatedMinutes: restaurant.deliveryTimeMin ?? 30,
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
 * Push a newly-ready order to every approved rider who is currently online.
 * Riders whose accounts are pending/rejected, or who are offline, are skipped.
 */
async function notifyAvailableRiders(order: OrderDoc, restaurantName: string): Promise<void> {
  try {
    const riders = await RiderProfileModel.find({
      approvalStatus: 'approved',
      isOnline: true,
      status: 'online',
    })
      .select('user')
      .lean();
    if (riders.length === 0) return;

    await Promise.all(
      riders.map((rider) =>
        notifyUser(String(rider.user), {
          type: 'order',
          event: 'order_ready',
          refId: String(order._id),
          title: 'New delivery available',
          body: `Order ${order.orderNumber} at ${restaurantName} is ready to collect.`,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            status: order.status,
          },
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Rider alerting is best-effort; the socket feed still announces the job.
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
}): Promise<{ order: OrderDoc; payment: PaymentDoc }> {
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

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
  });
  const { cart, restaurant, items, subtotal, deliveryFee, discount, platformFee, total } = totals;

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
      // Written BEFORE the wallet debit: this row is the idempotency lock.
      payment = await PaymentModel.create({
        user: input.customerId,
        kind: 'order',
        method,
        status: initialPaymentStatus,
        amount: total,
        currency: 'PKR',
        gateway: method === 'cash' ? 'cash' : method,
        initiatedAt: method === 'cash' ? null : new Date(),
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

  // Wallet is debited immediately and settled up-front. Every other method
  // records an intent only; the money moves later (or never, for COD).
  if (method === 'wallet') {
    try {
      const wallet = await debitWallet(input.customerId, total, 'debit', {
        reference: 'order',
        description: `Payment for order at ${restaurant.name}`,
        byUser: input.customerId,
      });
      const paidAt = new Date();
      const metadata = { walletTransaction: String(wallet.transaction._id) };
      await PaymentModel.updateOne(
        { _id: payment._id },
        { $set: { status: 'paid', paidAt, metadata } },
      );
      payment.status = 'paid';
      payment.paidAt = paidAt;
      payment.metadata = metadata;
      paymentStatus = 'paid';
    } catch (error) {
      // No money moved when the debit throws (e.g. insufficient balance), so
      // release the lock and let the customer retry with a fresh key.
      await PaymentModel.deleteOne({ _id: payment._id }).catch(() => undefined);
      throw error;
    }
  }

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
    });
  } catch (error) {
    // Order creation failed after the payment row was written.
    if (method === 'wallet' && paymentStatus === 'paid') {
      // Give the debited money back; the order does not exist, so there is
      // nothing else to reconcile.
      await creditWallet(input.customerId, total, 'refund', {
        reference: 'order',
        description: `Refund for failed checkout ${payment._id}`,
        byUser: input.customerId,
      }).catch(() => undefined);
      await PaymentModel.updateOne(
        { _id: payment._id },
        { $set: { status: 'refunded', refundedAt: new Date() } },
      ).catch(() => undefined);
    } else {
      // Nothing was charged: drop the lock so a retry can proceed.
      await PaymentModel.deleteOne({ _id: payment._id }).catch(() => undefined);
    }
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
    paymentGateway: args.method === 'cash' || args.method === 'wallet' ? undefined : args.method,
    riderPayout: Math.round((deliveryFee + platformFee) * RIDER_PAYOUT_RATE),
    note: input.note,
  });

  order.orderNumber = humanId('SWT', String(order._id));
  await order.save();

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

  // COD and wallet are actionable immediately. Gateway orders wait for the
  // verified payment so the kitchen is never told about an unpaid order.
  if (args.method === 'cash' || args.method === 'wallet') {
    // Notification failure must never turn a created order into a checkout
    // error (which would release the idempotency lock while the order exists).
    await notifyUser(input.customerId, {
      type: 'order',
      event: 'order_placed',
      refId: String(order._id),
      title: ORDER_STATUS_COPY.pending.title,
      body: ORDER_STATUS_COPY.pending.body(order.orderNumber, restaurant.name),
      data: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
    }).catch(() => undefined);

    // Live queue for the admin dashboard + persisted admin alert.
    if (isSocketReady()) {
      getIO()
        .to('role:admin')
        .emit(SOCKET_EVENTS.orderCreated, {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          status: order.status,
          total: order.total,
          restaurant: restaurant.name,
        });
    }
    await notifyAdminsNewOrder(order);
  }

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
  actorId: string,
): Promise<Order> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  const from = order.status;
  if (!canTransition(from, to)) {
    throw CONFLICT(transitionError(from, to));
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

  updated.statusHistory.push({ status: to, note: `Status updated to ${to}` });
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
  await notifyUser(String(updated.customer), {
    type: 'order',
    event: ORDER_STATUS_EVENTS[to],
    refId: String(updated._id),
    title: copy.title,
    body: copy.body(updated.orderNumber ?? '', restaurantName),
    data: { orderId: String(updated._id), orderNumber: updated.orderNumber, status: to },
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

  // No rider assigned yet: fan the job out to the approved riders who are
  // online right now. Previously the order sat in the feed with nobody told.
  if (to === 'ready' && !updated.rider) {
    await notifyAvailableRiders(updated, restaurantName);
  }

  return updated;
}

/**
 * Assign an approved rider to a ready order and emit rider-assigned live.
 *
 * Riders self-accepting through the feed are held to `ready` only: dispatching
 * them onto an order the kitchen has not packed yet leaves food waiting on a
 * rider. Admin dispatch may assign earlier (`allowEarly`) because an admin can
 * see the live queue and make that call deliberately.
 */
export async function assignRiderToOrder(
  orderId: string,
  riderUserId: string,
  options: { allowEarly?: boolean } = {},
): Promise<Order> {
  // A pending / rejected rider must never be able to take a job.
  await assertRiderApproved(riderUserId);

  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  if (!canAssignRider(order.status, options.allowEarly)) {
    throw CONFLICT(
      options.allowEarly
        ? 'Order is not ready for rider assignment'
        : 'This order is not ready for pickup yet',
    );
  }
  if (order.rider) throw CONFLICT('An rider is already assigned to this order');

  order.rider = riderUserId;
  order.status = 'rider_assigned';
  order.statusHistory.push({ status: 'rider_assigned', note: `Rider ${riderUserId} assigned` });
  order.riderPayout = Math.round((order.deliveryFee + order.platformFee) * RIDER_PAYOUT_RATE);
  await order.save();

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
  });

  // And the rider gets a push, not just a socket event.
  await notifyUser(riderUserId, {
    type: 'order',
    event: 'rider_assigned',
    refId: String(order._id),
    title: 'New delivery assigned',
    body: `Collect order ${order.orderNumber} from ${restaurantName}.`,
    data: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
  });

  return order;
}

export async function cancelOrder(input: {
  orderId: string;
  actorId: string;
  by: 'customer' | 'rider' | 'admin' | 'system';
  reason: string;
}): Promise<Order> {
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
        cancelReason: input.reason,
        cancelledBy: input.by,
      },
    },
    { new: true },
  );
  if (!cancelled) throw CONFLICT('Order changed concurrently. Refresh and try again.');
  cancelled.statusHistory.push({
    status: 'cancelled',
    note: `Cancelled by ${input.by}: ${input.reason}`,
  });
  await cancelled.save();

  // Refund wallet payments that were already debited at placement.
  if (cancelled.paymentMethod === 'wallet' && cancelled.paymentStatus === 'paid') {
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

  // Rejected before the kitchen ever accepted it; cancelled afterwards.
  const rejectedEarly = statusBeforeCancel === 'pending';
  await notifyUser(String(cancelled.customer), {
    type: 'order',
    event: rejectedEarly ? 'order_rejected' : 'order_cancelled',
    refId: String(cancelled._id),
    title: rejectedEarly ? 'Order rejected' : 'Order cancelled',
    body: rejectedEarly
      ? `${restaurantName} could not take order ${cancelled.orderNumber}.${cancelled.paymentStatus === 'refunded' ? ' Amount refunded to your wallet.' : ''}`
      : `Your order ${cancelled.orderNumber} was cancelled.${cancelled.paymentStatus === 'refunded' ? ' Amount refunded to your wallet.' : ''}`,
    data: { orderId: String(cancelled._id), orderNumber: cancelled.orderNumber, status: 'cancelled' },
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

  return cancelled;
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
