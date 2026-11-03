import type { Response } from 'express';
import {
  OrderModel,
  RiderDocumentModel,
  RiderProfileModel,
  RideModel,
  WalletTransactionModel,
  UserModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import {
  advanceOrderStatus,
  payRiderEarnings,
} from '../services/order.service';
import { paymentEligible, riderAcceptsOffer } from '../services/dispatch.service';
import { getOrCreateWallet } from '../services/wallet.service';
import { uploadFile } from '../services/storage.service';
import {
  assertNotSuspended,
  requestVehicleChange,
  setRiderBaseLocation,
} from '../services/riderVehicle.service';
import { assertRiderApproved } from '../services/riderApproval.service';
import { getSetting } from '../services/settings.service';

export const getRiderProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const [profile, user] = await Promise.all([
    RiderProfileModel.findOne({ user: req.user._id }).lean(),
    UserModel.findById(req.user._id).select('name phone email avatarUrl verified status').lean(),
  ]);
  if (!profile) throw NOT_FOUND('Rider profile');
  sendSuccess(res, { profile, user });
});

/**
 * Rider updates their own name/phone. Vehicle fields are deliberately not
 * written here: a vehicle change goes through `requestVehicleChange` so it can
 * be validated for duplicate plates and held for admin approval.
 */
export const updateRiderProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const body = req.body as {
    name?: string;
    phone?: string;
    vehicleType?: 'bike' | 'rickshaw' | 'van' | 'car';
    vehicleBrand?: string;
    vehiclePlate?: string;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone;

  if (body.name !== undefined || body.phone !== undefined) {
    const updated = await RiderProfileModel.findOneAndUpdate(
      { user: req.user._id },
      { $set: patch },
      { new: true },
    );
    if (!updated) throw NOT_FOUND('Rider profile');
    if (body.name) await UserModel.updateOne({ _id: req.user._id }, { $set: { name: body.name } });
  }

  // Vehicle changes are a separate, approval-gated concern.
  if (
    body.vehicleType !== undefined ||
    body.vehicleBrand !== undefined ||
    body.vehiclePlate !== undefined
  ) {
    const result = await requestVehicleChange(String(req.user._id), {
      vehicleType: body.vehicleType,
      vehicleBrand: body.vehicleBrand,
      vehiclePlate: body.vehiclePlate,
    });
    sendSuccess(res, { profile: result.profile, vehicleChangePending: result.pending });
    return;
  }

  const profile = await RiderProfileModel.findOne({ user: req.user._id }).lean();
  if (!profile) throw NOT_FOUND('Rider profile');
  sendSuccess(res, { profile });
});

/**
 * Rider proposes a vehicle change (type / brand / plate).
 *
 * Nothing is written to the live vehicle fields here — the proposal is parked
 * until an admin approves it, so dispatch can never be pointed at an
 * unverified bike. Returns `pending: true` while a change is queued.
 */
export const requestVehicleUpdate = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  await assertNotSuspended(String(req.user._id));
  const body = req.body as {
    vehicleType?: 'bike' | 'rickshaw' | 'van' | 'car';
    vehicleBrand?: string;
    vehiclePlate?: string;
  };
  const result = await requestVehicleChange(String(req.user._id), body);
  sendSuccess(res, { profile: result.profile, pending: result.pending });
});

/**
 * Save the rider's base location (the pin dropped on the map). Scoped to the
 * caller's own profile, so a rider can only ever move their own base.
 */
export const setBaseLocation = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const body = req.body as { lat: number; lng: number; label?: string };
  const profile = await setRiderBaseLocation(String(req.user._id), body);
  sendSuccess(res, { profile });
});

/** Toggle online/offline. Only approved riders can come online. */
export const setOnlineStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { online } = req.body as { online?: boolean };
  const profile = await RiderProfileModel.findOne({ user: req.user._id });
  if (!profile) throw NOT_FOUND('Rider profile');
  if (online && profile.approvalStatus !== 'approved') {
    throw new AppError('Your account is not approved yet', 403);
  }
  profile.status = online ? 'online' : 'offline';
  profile.isOnline = Boolean(online);
  await profile.save();
  sendSuccess(res, { status: profile.status, isOnline: profile.isOnline });
});

/** Pending rider documents upload (CNIC, license, vehicle registration). */
export const uploadDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const file = req.file;
  if (!file) throw new AppError('A document file is required', 422);
  const { type } = req.body as { type?: string };
  const docType = ['cnic_front', 'cnic_back', 'license', 'vehicle_reg'].includes(type ?? '')
    ? (type as 'cnic_front' | 'cnic_back' | 'license' | 'vehicle_reg')
    : undefined;
  if (!docType) throw new AppError('Document type is required', 422);

  const profile = await RiderProfileModel.findOne({ user: req.user._id });
  if (!profile) throw NOT_FOUND('Rider profile');

  const uploaded = await uploadFile(file, 'swat-city/riders');
  const doc = await RiderDocumentModel.create({
    rider: profile._id,
    type: docType,
    url: uploaded.url,
    publicId: uploaded.publicId,
    status: 'pending',
  });

  if (profile.approvalStatus === 'pending') {
    await RiderProfileModel.updateOne(
      { user: req.user._id },
      { $set: { verificationId: doc._id } },
    );
  }

  sendSuccess(res, { document: doc });
});

export const myDocuments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await RiderProfileModel.findOne({ user: req.user._id }).select('_id');
  if (!profile) throw NOT_FOUND('Rider profile');
  const documents = await RiderDocumentModel.find({ rider: profile._id }).sort('-createdAt');
  sendSuccess(res, { documents });
});

/**
 * Rider live feed: food orders ready for pickup that are not assigned yet.
 * (Ride requests arrive over Socket.IO ride:request by design.)
 */
export const riderFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  // The feed carries customer drop-off addresses, so it is work data: only an
  // admin-approved rider may read it. Without this gate a pending or rejected
  // applicant could still harvest live delivery addresses.
  await assertRiderApproved(String(req.user._id));
  const profile = await RiderProfileModel.findOne({ user: req.user._id }).lean();
  if (!profile) throw NOT_FOUND('Rider profile');

  const ordersRaw = await OrderModel.find({ status: 'ready', rider: null, deletedAt: null })
    .sort({ createdAt: 1 })
    .limit(20)
    .populate('restaurant', 'name emoji gradient addressLine area deliveryKM cuisine')
    .lean();

  // Payment gate, second layer: a manual-transfer order is work for a rider
  // ONLY once an admin verified its screenshot to `paid` (or a gateway settled
  // it); a `pending` payment is legitimate solely for cash-on-delivery.
  const orders = (ordersRaw as (typeof ordersRaw[number])[]).filter((o) => paymentEligible(o as never));

  const feed = orders.map((o) => {
    const restaurant = o.restaurant as unknown as
      | { name?: string; emoji?: string; gradient?: string[]; addressLine?: string; area?: string }
      | undefined;
    return {
      id: String(o._id),
      kind: 'food' as const,
      pickup: `${restaurant?.name ?? 'Restaurant'}${restaurant?.area ? ` • ${restaurant.area}` : ''}`,
      dropoff: o.addressSnapshot?.full ?? '',
      distanceKm: o.distanceKm,
      durationMin: o.estimatedMinutes,
      payout: o.riderPayout,
      restaurantEmoji: restaurant?.emoji,
      restaurantGradient: restaurant?.gradient,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
    };
  });
  sendSuccess(res, { feed });
});

/**
 * Rider accepts an offered / ready food order.
 *
 * The claim is one atomic SQL statement (`accept_rider_order`): first Accept
 * wins, concurrent losers get "someone else took this order", a rider already
 * holding an active delivery gets "one delivery at a time", and an unverified
 * payment (screenshot not admin-approved) can never be claimed at all — all
 * enforced in the database, not in this handler.
 */
export const acceptOrderJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { orderId } = req.body as { orderId: string };
  const order = await riderAcceptsOffer(String(req.user._id), orderId);
  sendSuccess(res, { order });
});

/** Rider updates the delivery leg: picked_up → on_the_way → delivered. */
export const updateDelivery = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { orderId, status } = req.body as {
    orderId: string;
    status: 'picked_up' | 'on_the_way' | 'delivered';
  };
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');
  if (!order.rider || String(order.rider) !== req.user._id) {
    throw new AppError('This order is not assigned to you', 403);
  }

  const updated = await advanceOrderStatus(orderId, status, req.user._id);
  if (status === 'delivered') {
    await payRiderEarnings(orderId, req.user._id);
  }
  sendSuccess(res, { order: updated });
});

/** Rider earnings summary + history. */
export const riderEarnings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const wallet = await getOrCreateWallet(req.user._id, true);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [weekTx, allTx, deliveredOrders, assignedCount, cancelledCount, ratingDoc, completedRides, weekRides] =
    await Promise.all([
      WalletTransactionModel.find({
        user: req.user._id,
        type: { $in: ['earning', 'debit'] },
        createdAt: { $gte: startOfWeek },
      }).lean(),
      WalletTransactionModel.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      OrderModel.find({ rider: req.user._id, status: 'delivered' })
        .select('distanceKm riderPayout')
        .lean(),
      OrderModel.countDocuments({ rider: req.user._id, status: { $ne: 'pending' } }),
      OrderModel.countDocuments({ rider: req.user._id, status: 'cancelled' }),
      RiderProfileModel.findOne({ user: req.user._id }).select('rating totalTrips').lean(),
      RideModel.countDocuments({ rider: req.user._id, status: 'completed' }),
      RideModel.find({ rider: req.user._id, status: 'completed' }).select('distanceKm').lean(),
    ]);

  const deliveredCount = deliveredOrders.length;
  // Km actually served: delivered food orders + completed rides.
  const totalKm =
    (deliveredOrders as any[]).reduce((s, o) => s + (Number(o.distanceKm) || 0), 0) +
    (weekRides as any[]).reduce((s, r) => s + (Number(r.distanceKm) || 0), 0);
  // Acceptance: how often the rider finished what they accepted. A cancelled
  // job counts against them only once (denominator = every job they touched).
  const acceptance =
    deliveredCount === 0
      ? 100
      : Math.round((deliveredCount / Math.max(1, deliveredCount + cancelledCount)) * 100);

  const weekAmount = weekTx.filter((t) => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
  const profile = ratingDoc ?? { rating: 0, totalTrips: 0 };
  const completed = deliveredCount + completedRides;
  const weeklyTargetSetting = await getSetting<number>('rider_weekly_target');
  const weeklyTarget = Number.isFinite(Number(weeklyTargetSetting))
    ? Number(weeklyTargetSetting)
    : 6000;

  sendSuccess(res, {
    balance: wallet.balance,
    stats: {
      rating: profile.rating ?? 0,
      completed,
      totalTrips: profile.totalTrips ?? 0,
      acceptance,
      satisfaction: Math.round(((profile.rating ?? 0) / 5) * 100),
      totalKm: Math.round(totalKm * 10) / 10,
    },
    period: {
      label: 'This week',
      amount: weekAmount,
      trips: weekTx.filter((t) => t.type === 'earning').length,
      target: weeklyTarget,
      progress: Math.min(100, Math.round((weekAmount / Math.max(1, weeklyTarget)) * 100)),
      onTime: 97,
    },
    transactions: allTx,
  });
});

/**
 * Weekly payout leaderboard: top riders by food-order earnings over the rolling
 * 7 days, with the caller's own standing attached. Drives the friendly
 * competition cards on the rider earnings hub.
 */
export const riderLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const [delivered, riders] = await Promise.all([
    OrderModel.find({
      status: 'delivered',
      rider: { $ne: null } as any,
      updatedAt: { $gte: startOfWeek },
    })
      .select('rider riderPayout distanceKm')
      .lean(),
    RiderProfileModel.find({})
      .select('user name rating')
      .lean(),
  ]);

  const byRider = new Map<string, { earnings: number; trips: number; km: number }>();
  for (const o of delivered as any[]) {
    if (!o.rider) continue;
    const key = String(o.rider);
    const cur = byRider.get(key) ?? { earnings: 0, trips: 0, km: 0 };
    cur.earnings += Number(o.riderPayout) || 0;
    cur.trips += 1;
    cur.km += Number(o.distanceKm) || 0;
    byRider.set(key, cur);
  }

  const names = new Map<string, string>();
  for (const r of riders as any[]) names.set(String(r.user), String(r.name ?? 'Rider'));

  const rows = Array.from(byRider.entries())
    .map(([riderId, agg]) => ({
      riderId,
      name: names.get(riderId) ?? 'Rider',
      earnings: Math.round(agg.earnings),
      trips: agg.trips,
      km: Math.round(agg.km * 10) / 10,
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);

  const myIndex = rows.findIndex((r) => r.riderId === String(req.user?._id));
  sendSuccess(res, {
    range: 'rolling-7d',
    leaders: rows,
    me: myIndex >= 0 ? { rank: myIndex + 1, ...rows[myIndex] } : { rank: null },
  });
});

/** Rider accepted/active jobs + historical rides. */
export const riderJobs = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const [orders, rides] = await Promise.all([
    OrderModel.find({
      rider: req.user._id,
      status: { $in: ['rider_assigned', 'picked_up', 'on_the_way'] },
    })
      .sort({ createdAt: -1 })
      .populate('customer', 'name phone')
      .populate('restaurant', 'name emoji gradient addressLine area')
      .lean(),
    RideModel.find({ rider: req.user._id, status: { $in: ['accepted', 'arriving', 'started'] } })
      .sort({ createdAt: -1 })
      .populate('customer', 'name phone')
      .lean(),
  ]);
  sendSuccess(res, { orders, rides });
});

export const riderCancelledJobs = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const orders = await OrderModel.find({ rider: req.user._id, status: 'cancelled' })
    .sort('-createdAt')
    .limit(20)
    .lean();
  sendSuccess(res, { orders });
});
