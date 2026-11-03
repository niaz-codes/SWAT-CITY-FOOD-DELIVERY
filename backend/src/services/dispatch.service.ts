// ============================================================
// Rider auto-dispatch service
//
// A food order becomes work for riders ONLY when two things hold:
//   1. status = `ready`  (the kitchen packed it)
//   2. paymentStatus = `paid` (an admin verified the transfer / a gateway
//      settled it) — or it is a cash order, which is payable on delivery.
//
// Never anything else. A manual-transfer order whose screenshot is still
// `pending_verification` or was `rejected` can never be offered, accepted or
// assigned here — that gate exists in the dispatch guard, in the rider feed,
// and inside the atomic claim function (accept_rider_order) as a belt of three.
//
// Dispatch rounds:
//   - `dispatchOrder` offers the order to every available online rider at once
//     (Socket.IO `order:request` + Expo push with the real work details).
//   - Riders see a countdown (ttlMs) and the first Accept claims the order
//     atomically in Postgres (rider.service → accept_rider_order).
//   - `startDispatchSweeper` re-broadcasts a fresh round when one has expired
//     without a claim, and alerts admins when NO rider is online so the queue
//     is never silently stranded.
// ============================================================

import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import {
  OrderModel,
  RestaurantModel,
  RideModel,
  RiderProfileModel,
  UserModel,
  type Order,
} from '../models';
import { notifyUser } from './notification.service';
import { AppError, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { emitToRiders, emitToUser, getIO, isSocketReady, SOCKET_EVENTS } from '../sockets';
import { assertRiderApproved } from './riderApproval.service';

/** Payment states that make an order eligible for rider assignment. */
export const ASSIGNABLE_PAYMENT_STATUSES = ['paid', 'pending'] as const;
/** Cash orders settle on delivery; everything else must be verified money. */
const CASH_METHOD = 'cash';

export function paymentEligible(order: Order): boolean {
  const status = String(order.paymentStatus);
  if (!ASSIGNABLE_PAYMENT_STATUSES.includes(status as 'paid' | 'pending')) return false;
  // A `pending` payment is only legitimate for cash-on-delivery: an unpaid
  // manual/gateway order must finish admin verification first.
  if (status === 'pending' && String(order.paymentMethod) !== CASH_METHOD) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The atomic claim (first Accept wins)
// ---------------------------------------------------------------------------

type ClaimOutcome = 'accepted' | 'order_unavailable' | 'rider_not_approved' | 'rider_busy';

/**
 * Calls the single-statement Postgres claim exposed by the schema migration
 * (`accept_rider_order`). If two riders Accept concurrently, one row-level
 * lock serialises them; the loser re-evaluates `rider is null` against the
 * first winner's committed row and gets nothing.
 */
async function claimOrder(riderId: string, orderId: string): Promise<ClaimOutcome> {
  const { data, error } = await supabaseAdmin.rpc('accept_rider_order', {
    p_order: orderId,
    p_rider: riderId,
  });
  if (error) {
    // A missing function means the schema migration has not been applied yet —
    // surface that loudly instead of pretending the claim happened.
    const message = (error as { message?: string }).message ?? 'claim failed';
    throw new AppError(
      `Order claim failed: ${message}. Run "npm run schema:apply" in backend/.`,
      500,
    );
  }
  const result = (data as { result?: ClaimOutcome } | null)?.result ?? 'order_unavailable';
  return result;
}

/** Public alias so lifecycle services (admin assignment, cancels) share the
 * exact same SQL claim the rider accept endpoint uses. */
export const claimRiderOrder = claimOrder;

// ---------------------------------------------------------------------------
// One dispatch round
// ---------------------------------------------------------------------------

export type RiderOffer = {
  orderId: string;
  orderNumber: string | null;
  /** Round number; a rider who rejected round N is re-offered on N+1. */
  attempt: number;
  /** Matched by the rider app's Accept countdown timer. */
  ttlMs: number;
  restaurant: { name: string; area: string };
  /** Pickup address when the restaurant record carries one. */
  pickupAddress: string;
  dropoff: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  distanceKm: number;
  durationMin: number;
  payout: number;
  total: number;
  itemCount: number;
  itemNames: string[];
  paymentMethod: string;
  broadcastAt: string;
};

/** Builds the exact payload both the socket offer and the push carry. */
export async function buildOfferPayload(order: Order, attempt: number): Promise<RiderOffer> {
  const restaurant = order.restaurant
    ? await RestaurantModel.findById(String(order.restaurant))
        .select('name area addressLine')
        .lean()
        .catch(() => null)
    : null;
  const bits = (restaurant ?? {}) as { name?: string; area?: string; addressLine?: string };

  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber ?? null,
    attempt,
    ttlMs: Math.max(5, env.DISPATCH_OFFER_TTL_SECONDS) * 1000,
    restaurant: {
      name: String(bits.name ?? 'Restaurant'),
      area: String(bits.area ?? ''),
    },
    pickupAddress: String(bits.addressLine ?? ''),
    dropoff: order.addressSnapshot?.full ?? '',
    dropoffLat: order.addressSnapshot?.lat ?? null,
    dropoffLng: order.addressSnapshot?.lng ?? null,
    distanceKm: Number(order.distanceKm) || 0,
    durationMin: Number(order.estimatedMinutes) || 0,
    payout: Number(order.riderPayout) || 0,
    total: Number(order.total) || 0,
    itemCount: (order.items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    itemNames: (order.items ?? [])
      .map((i) => String(i.name ?? ''))
      .filter(Boolean)
      .slice(0, 5),
    paymentMethod: String(order.paymentMethod),
    broadcastAt: new Date().toISOString(),
  };
}

/** Approved + available online riders right now (empty = nobody to offer to). */
export async function availableOnlineRiderIds(): Promise<string[]> {
  const riders = await RiderProfileModel.find({
    approvalStatus: 'approved',
    isOnline: true,
    status: 'online',
  })
    .select('user')
    .lean();
  return (riders as { user?: unknown }[]).map((r) => String(r.user)).filter(Boolean);
}

export interface DispatchResult {
  dispatched: boolean;
  attempt: number | null;
  ridersNotified: number;
  reason: 'assigned' | 'not_ready' | 'payment_unverified' | 'no_riders' | 'offered';
}

/**
 * Start (or repeat) the rider offer rounds for one order. Idempotent and safe
 * to call from every trigger (order readiness, admin panel, sweeper).
 *
 * No rider online → the order stays pending in the pool and the admin team is
 * alerted ("add a rider or accept on the panel"), re-alerted on the env-tuned
 * interval so an unstaffed shift stays visible instead of being silent.
 */
export async function dispatchOrder(orderId: string): Promise<DispatchResult> {
  const order = (await OrderModel.findById(orderId).lean()) as Order | null;
  if (!order || order.deletedAt) {
    return { dispatched: false, attempt: null, ridersNotified: 0, reason: 'not_ready' };
  }
  if (String(order.status) !== 'ready') {
    return { dispatched: false, attempt: null, ridersNotified: 0, reason: 'not_ready' };
  }
  if (order.rider) {
    // Claimed while we were loading — kill any lingering offer immediately.
    await stopDispatchForOrder(String(order._id), 'assigned');
    return { dispatched: false, attempt: null, ridersNotified: 0, reason: 'assigned' };
  }
  // THE payment gate. A customer screenshot is never money: only admin
  // verification (or settled gateway / payable cash) opens rider assignment.
  if (!paymentEligible(order)) {
    return { dispatched: false, attempt: null, ridersNotified: 0, reason: 'payment_unverified' };
  }

  const now = Date.now();
  const riders = await availableOnlineRiderIds();

  if (riders.length === 0) {
    const lastAlert = order.dispatchLastAdminAlertAt
      ? new Date(order.dispatchLastAdminAlertAt as unknown as string).getTime()
      : 0;
    const alertGapMs = Math.max(1, env.DISPATCH_ADMIN_ALERT_MINUTES) * 60_000;
    if (now - lastAlert >= alertGapMs) {
      await notifyAdminsNoRiders(order).catch(() => undefined);
      await OrderModel.updateOne(
        { _id: order._id },
        {
          $set: {
            dispatchStartedAt: order.dispatchStartedAt ?? new Date(now),
            dispatchLastAdminAlertAt: new Date(now),
          },
        },
      ).catch(() => undefined);
    }
    return { dispatched: false, attempt: null, ridersNotified: 0, reason: 'no_riders' };
  }

  // A round is broadcast when none is running: either never offered, the last
  // offer round expired without a claim (retry on the fresh rider set), or a
  // manual trigger asked for one. An active round is left alone so we never
  // spam riders who are literally watching a countdown.
  const lastOfferAt = order.dispatchLastOfferAt
    ? new Date(order.dispatchLastOfferAt as unknown as string).getTime()
    : 0;
  const retryGapMs = Math.max(5, env.DISPATCH_RETRY_SECONDS) * 1000;
  const roundActive = lastOfferAt > 0 && Date.now() - lastOfferAt < retryGapMs;
  const attempt = (Number(order.dispatchAttempts) || 0) + (roundActive ? 0 : 1);

  if (roundActive) {
    return {
      dispatched: false,
      attempt: Number(order.dispatchAttempts) || 1,
      ridersNotified: 0,
      reason: 'offered',
    };
  }

  const freshOrder = (await OrderModel.findById(String(order._id))) as Order;
  const offer = await buildOfferPayload(freshOrder, attempt);

  await OrderModel.updateOne(
    { _id: order._id },
    {
      $set: {
        dispatchStartedAt: order.dispatchStartedAt ?? new Date(now),
        dispatchLastOfferAt: new Date(now),
        dispatchAttempts: attempt,
      },
    },
  ).catch(() => undefined);

  // Scoped fan-out: work details (the customer drop-off) reach only riders who
  // are online right now, each into their own private room.
  for (const riderId of riders) {
    emitToUser(riderId, SOCKET_EVENTS.orderRequest, offer);
  }

  await Promise.all(
    riders.map((riderId) =>
      notifyUser(riderId, {
        type: 'order',
        event: 'order_ready',
        refId: String(order._id),
        title: `New delivery · Rs ${offer.payout}`,
        body: `${offer.restaurant.name} → ${offer.dropoff} · ${offer.distanceKm.toFixed(1)} km · order ${offer.orderNumber ?? ''}`.trim(),
        data: {
          orderId: String(order._id),
          orderNumber: offer.orderNumber,
          attempt,
          ttlMs: offer.ttlMs,
          payout: offer.payout,
          distanceKm: offer.distanceKm,
        },
      }).catch(() => undefined),
    ),
  );

  return { dispatched: true, attempt, ridersNotified: riders.length, reason: 'offered' };
}

/** Tell every rider UI an offered order left the pool (claimed or dead). */
export function broadcastResolved(orderId: string, reason: string): void {
  if (!isSocketReady()) return;
  emitToRiders(SOCKET_EVENTS.orderRequestResolved, { orderId, reason });
}

/**
 * Kill pending offer state for an order that left the pool (assigned or
 * cancelled). Resets the bookkeeping so a hypothetical later re-entry starts
 * from zero.
 */
export async function stopDispatchForOrder(orderId: string, reason: string): Promise<void> {
  broadcastResolved(orderId, reason);
  await OrderModel.updateOne(
    { _id: orderId },
    { $set: { dispatchLastOfferAt: null, dispatchAttempts: 0 } },
  ).catch(() => undefined);
}

/**
 * No-rider alert to the admin team (throttled per order by the caller).
 * Kept here (not in order.service) so dispatch has no service-level cycle.
 */
export async function notifyAdminsNoRiders(order: Order): Promise<void> {
  try {
    const admins = await UserModel.find({ role: 'admin', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    if (admins.length === 0) return;
    await Promise.all(
      (admins as { _id?: unknown }[]).map((admin) =>
        notifyUser(String(admin._id), {
          type: 'order',
          event: 'order_placed',
          refId: String(order._id),
          title: 'No rider online',
          body: `Order ${order.orderNumber} is ready at a restaurant but no rider is online. Assign from the admin panel or bring riders online.`,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            status: order.status,
            dispatch: 'no_riders',
          },
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Admin alerting is best-effort; the panel lists pending dispatch regardless.
  }
}

// ---------------------------------------------------------------------------
// Rider accept (the claim, plus every side effect that must follow it)
// ---------------------------------------------------------------------------

/**
 * A rider taps Accept on an offer / feed row. The claim itself is one atomic
 * SQL statement, so the response answers one of three truths:
 *   accepted          — this rider owns the order; every other rider is told
 *                       the order is gone
 *   order_unavailable — another rider was faster, or the kitchen withdrew it
 *   rider_busy        — this rider already owns an active delivery
 */
export async function riderAcceptsOffer(riderId: string, orderId: string): Promise<Order> {
  await assertRiderApproved(riderId);

  const outcome = await claimOrder(riderId, orderId);
  if (outcome === 'rider_not_approved') {
    throw new AppError('Your account is not approved yet', 403);
  }
  if (outcome === 'rider_busy') {
    throw CONFLICT('Finish your active delivery first — one delivery at a time.');
  }
  if (outcome !== 'accepted') {
    throw CONFLICT('Too late — someone else took this order.');
  }

  const order = (await OrderModel.findById(orderId)
    .populate('restaurant', 'name emoji gradient addressLine area')
    .lean()) as Order | null;
  if (!order) throw NOT_FOUND('Order');

  const io = getIO();
  const restaurantName = String(
    (order.restaurant as unknown as { name?: string } | null)?.name ?? 'the restaurant',
  );

  // The rider's own room: their shell flips to the active-delivery leg.
  io.to(`user:${riderId}`).emit(SOCKET_EVENTS.orderRiderAssigned, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    message: 'New delivery assigned',
  });

  // Everyone still showing the offer is told it is gone.
  broadcastResolved(String(order._id), 'assigned');

  await notifyUser(String(order.customer), {
    type: 'order',
    event: 'rider_assigned',
    refId: String(order._id),
    title: 'Rider assigned',
    body: `A rider has been assigned to order ${order.orderNumber} and is heading to the restaurant.`,
    data: { orderId: String(order._id), orderNumber: order.orderNumber, status: 'rider_assigned' },
  }).catch(() => undefined);

  await notifyUser(riderId, {
    type: 'order',
    event: 'rider_assigned',
    refId: String(order._id),
    title: 'New delivery assigned',
    body: `Collect order ${order.orderNumber} from ${restaurantName}.`,
    data: { orderId: String(order._id), orderNumber: order.orderNumber, status: 'rider_assigned' },
  }).catch(() => undefined);

  await stopDispatchForOrder(String(order._id), 'assigned').catch(() => undefined);

  return order;
}

/**
 * A delivery ended (delivered, or cancelled while riding): the author goes
 * back to `online` — but ONLY when no other active job is still holding them
 * in `busy`. Cheap and idempotent.
 */
export async function revertRiderStatusIfIdle(riderId: string): Promise<void> {
  try {
    const [activeOrders, activeRides] = await Promise.all([
      OrderModel.exists({
        rider: riderId,
        status: { $in: ['rider_assigned', 'picked_up', 'on_the_way'] },
      }),
      RideModel.exists({ rider: riderId, status: { $in: ['accepted', 'arriving', 'started'] } }),
    ]);
    if (activeOrders || activeRides) return;
    await RiderProfileModel.updateOne(
      { user: riderId, status: 'busy' },
      { $set: { status: 'online', isOnline: true } },
    );
  } catch {
    // Status cosmetics — never fail the lifecycle step over it.
  }
}

// ---------------------------------------------------------------------------
// The sweeper: retries + no-rider alerts
// ---------------------------------------------------------------------------

let sweepTimer: NodeJS.Timeout | null = null;

/**
 * Scans the unclaimed-ready pool. Orders whose latest round has expired get a
 * fresh round ("notify the next available riders or retry"); orders with no
 * eligible online riders keep the admin alert line alive instead.
 */
export async function sweepOpenDispatches(): Promise<void> {
  const pool = (await OrderModel.find({
    status: 'ready',
    rider: null,
    deletedAt: null,
    paymentStatus: { $in: [...ASSIGNABLE_PAYMENT_STATUSES] },
  })
    .limit(50)
    .lean()) as unknown as Order[];

  for (const order of pool) {
    // Re-derive in the guard so the eligibility rule lives in exactly one
    // place even if the pool index is later widened for other methods.
    if (!paymentEligible(order)) continue;
    await dispatchOrder(String(order._id)).catch(() => undefined);
  }
}

export function startDispatchSweeper(intervalMs?: number): () => void {
  if (sweepTimer) return () => undefined;
  const resolved = intervalMs ?? Math.max(5, env.DISPATCH_SWEEP_SECONDS) * 1000;
  sweepTimer = setInterval(() => {
    void sweepOpenDispatches().catch((error: unknown) => {
      console.error('[dispatch] sweep failed:', (error as Error).message);
    });
  }, resolved);
  sweepTimer.unref?.();
  return () => {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
  };
}
