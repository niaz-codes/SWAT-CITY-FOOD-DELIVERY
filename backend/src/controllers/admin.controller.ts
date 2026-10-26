import type { Response } from 'express';
import {
  OrderModel,
  RestaurantModel,
  RiderProfileModel,
  RideModel,
  SupportTicketModel,
  UserModel,
  WithdrawalModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import { notifyUser } from '../services/notification.service';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinary.service';
import { clearRiderLocation } from '../services/riderLocation.service';
import { paginationMeta, startOfDay } from '../utils/helpers';

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);

/** Indexes 7 day windows starting 6 days ago -> today. */
function weekDays(): Date[] {
  const today = startOfDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
}

async function sumDeliveredRevenueBetween(model: typeof OrderModel, from: Date, to: Date) {
  const rows = await model.find({ createdAt: { $gte: from, $lt: to }, status: 'delivered' }).lean();
  return rows.reduce((sum, r: any) => sum + (Number(r.total) || 0), 0);
}

async function sumCompletedRideFareBetween(model: typeof RideModel, from: Date, to: Date) {
  const rows = await model.find({ createdAt: { $gte: from, $lt: to }, status: 'completed' }).lean();
  return rows.reduce((sum, r: any) => sum + (Number(r.fare) || 0), 0);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();

  const today = startOfDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const days = weekDays();

  const dayBuckets = days.map((day) => {
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return { day, next };
  });

  const [
    totalOrders,
    totalRides,
    todayOrders,
    todayRides,
    totalRevenue,
    todayRevenue,
    totalCustomers,
    totalRiders,
    totalRestaurants,
    pendingRiderApprovals,
    openTickets,
    pendingWithdrawals,
    statusCounts,
  ] = await Promise.all([
    OrderModel.countDocuments({ deletedAt: null }),
    RideModel.countDocuments({}),
    OrderModel.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    RideModel.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    (async () => {
      const [fo, ri] = await Promise.all([
        sumDeliveredRevenueBetween(OrderModel, new Date(0), tomorrow),
        sumCompletedRideFareBetween(RideModel, new Date(0), tomorrow),
      ]);
      return Math.round(fo + ri);
    })(),
    (async () => {
      const [fo, ri] = await Promise.all([
        sumDeliveredRevenueBetween(OrderModel, today, tomorrow),
        sumCompletedRideFareBetween(RideModel, today, tomorrow),
      ]);
      return Math.round(fo + ri);
    })(),
    UserModel.countDocuments({ role: 'customer', deletedAt: null }),
    UserModel.countDocuments({ role: 'rider', deletedAt: null }),
    RestaurantModel.countDocuments({ deletedAt: null }),
    RiderProfileModel.countDocuments({ approvalStatus: 'pending' }),
    SupportTicketModel.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    WithdrawalModel.countDocuments({ status: 'pending' }),
    (async () => {
      const rows = await OrderModel.find({ deletedAt: null }).lean();
      const map = new Map<string, number>();
      for (const r of rows as any[]) {
        const key = r.status || 'unknown';
        map.set(key, (map.get(key) || 0) + 1);
      }
      return Array.from(map.entries()).map(([id, count]) => ({ _id: id, count }));
    })(),
  ]);

  // Per-day series for charts
  const dailyOrders: { label: string; count: number }[] = [];
  const weeklyRevenue: { label: string; value: number }[] = [];
  const customerGrowth: { label: string; count: number }[] = [];
  const riderGrowth: { label: string; count: number }[] = [];
  let foodCount = 0;
  let rideCount = 0;

  for (const { day, next } of dayBuckets) {
    const [orders, newCustomers, newRiders, dayFood, dayRide, dayOrderRevenue, dayRideRevenue] =
      await Promise.all([
        OrderModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        UserModel.countDocuments({ role: 'customer', createdAt: { $gte: day, $lt: next } }),
        UserModel.countDocuments({ role: 'rider', createdAt: { $gte: day, $lt: next } }),
        OrderModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        RideModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        sumDeliveredRevenueBetween(OrderModel, day, next),
        sumCompletedRideFareBetween(RideModel, day, next),
      ]);
    dailyOrders.push({ label: dayLabel(day), count: orders });
    weeklyRevenue.push({
      label: dayLabel(day),
      value: Math.round(dayOrderRevenue + dayRideRevenue),
    });
    customerGrowth.push({ label: dayLabel(day), count: newCustomers });
    riderGrowth.push({ label: dayLabel(day), count: newRiders });
    foodCount += dayFood;
    rideCount += dayRide;
  }

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts as any[]) statusMap[s._id] = s.count;

  sendSuccess(res, {
    totals: {
      revenue: totalRevenue,
      orders: totalOrders,
      rides: totalRides,
      riders: totalRiders,
      customers: totalCustomers,
      restaurants: totalRestaurants,
      pendingRiderApprovals,
      openTickets,
      pendingWithdrawals,
    },
    today: {
      orders: todayOrders,
      rides: todayRides,
      revenue: todayRevenue,
    },
    statusCounts: statusMap,
    charts: {
      dailyOrders,
      weeklyRevenue,
      serviceSplit: [
        { label: 'Food', count: foodCount },
        { label: 'Ride', count: rideCount },
      ],
      customerGrowth,
      riderGrowth,
    },
  });
});

// ---------------------------------------------------------------------------
// Users management
// ---------------------------------------------------------------------------

export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { role, status, search, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = { deletedAt: null };
  if (role && role !== 'all') query.role = role;
  if (status && status !== 'all') query.status = status;
  if (search) {
    const rx = { $regex: String(search), $options: 'i' };
    query.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [users, total] = await Promise.all([
    UserModel.find(query)
      .select('-password -deviceTokens')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    UserModel.countDocuments(query),
  ]);
  sendSuccess(res, { users }, paginationMeta(p, l, total));
});

export const updateUserStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.params.id === req.user._id)
    throw new AppError('You cannot suspend your own account', 422);
  const user = await UserModel.findById(req.params.id);
  if (!user) throw NOT_FOUND('User');
  const fresh = await UserModel.findById(req.params.id);
  if (!fresh) throw NOT_FOUND('User');
  fresh.status = req.body.status;
  await fresh.save();

  await notifyUser(String(fresh._id), {
    type: 'system',
    title: fresh.status === 'suspended' ? 'Account suspended' : 'Account reactivated',
    body:
      fresh.status === 'suspended'
        ? 'Your account has been suspended. Contact support if you believe this is a mistake.'
        : 'Your account has been reactivated. Welcome back!',
    data: { status: fresh.status },
  });

  sendSuccess(res, { message: 'Status updated' });
});

// ---------------------------------------------------------------------------
// Riders management
// ---------------------------------------------------------------------------

export const listRiders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { approval, status, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (approval && approval !== 'all') query.approvalStatus = approval;
  if (status && status !== 'all') query.status = status;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [profiles, total] = await Promise.all([
    RiderProfileModel.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate('user', 'phone email verified')
      .lean(),
    RiderProfileModel.countDocuments(query),
  ]);
  sendSuccess(res, { riders: profiles }, paginationMeta(p, l, total));
});

export const riderDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id)
    .populate('user', 'name phone email avatarUrl verified status')
    .populate('verificationId')
    .lean();
  if (!profile) throw NOT_FOUND('Rider');
  const documents = await RiderDocumentModelFind(profile._id);
  sendSuccess(res, { rider: profile, documents });
});

async function RiderDocumentModelFind(profileId: string) {
  // dynamic import avoids pulling the model into the module graph twice
  const { RiderDocumentModel } = await import('../models');
  return RiderDocumentModel.find({ rider: profileId }).sort('-createdAt').lean();
}

/** Resolve a RiderProfile by either its own _id or its linked User id. */
function findRiderProfile(id: string) {
  return RiderProfileModel.findOne({ $or: [{ _id: id }, { user: id }] });
}

/** Approve / reject a rider by their User id. */
export const reviewRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { approvalStatus, note } = req.body as {
    approvalStatus?: 'approved' | 'rejected';
    note?: string;
  };

  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  if (!approvalStatus || (approvalStatus !== 'approved' && approvalStatus !== 'rejected')) {
    throw new AppError('approvalStatus must be approved or rejected', 422);
  }

  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.approvalStatus = approvalStatus;
  // Rejecting requires a reason; approving clears any previous rejection.
  fresh.rejectionReason =
    approvalStatus === 'rejected' ? note?.trim() || 'Not approved' : (null as any);
  // id is string in new layer; don't cast
  (fresh as any).reviewedBy = req.user._id;
  fresh.reviewedAt = new Date();
  if (approvalStatus === 'rejected') {
    fresh.status = 'offline';
    fresh.isOnline = false;
    clearRiderLocation(userId);
  }
  if (note) {
    const { RiderDocumentModel } = await import('../models');
    await RiderDocumentModel.updateMany(
      { rider: fresh._id, status: 'pending' },
      {
        $set: {
          status: approvalStatus,
          reviewNote: note,
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
        },
      },
    );
  }
  await fresh.save();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { isApproved: approvalStatus === 'approved', pendingApproval: false } },
  );

  await notifyUser(userId, {
    type: 'system',
    title: approvalStatus === 'approved' ? 'You are approved!' : 'Application rejected',
    body:
      approvalStatus === 'approved'
        ? 'Congratulations! You can now go online and start delivering.'
        : `Your rider application was rejected.${note ? ` Reason: ${note}` : ''}`,
  });
  sendSuccess(res, { rider: profile });
});

export const approveRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.approvalStatus = 'approved';
  fresh.status = 'offline';
  fresh.isOnline = false;
  // A re-approval supersedes any earlier rejection, so the stale reason is
  // cleared rather than left for the rider to read on an approved profile.
  fresh.rejectionReason = null as any;
  (fresh as any).reviewedBy = req.user._id;
  fresh.reviewedAt = new Date();
  await fresh.save();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { isApproved: true, pendingApproval: false, status: 'active' } },
  );
  await notifyUser(userId, {
    type: 'system',
    title: 'You are approved!',
    body: 'Congratulations! You can now go online and start delivering.',
  });
  sendSuccess(res, { rider: profile, hasApprovedPhoto: Boolean(profile.avatarUrl) });
});

export const rejectRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) throw new AppError('A rejection reason is required', 422);

  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.approvalStatus = 'rejected';
  fresh.rejectionReason = reason.trim();
  (fresh as any).reviewedBy = req.user._id;
  fresh.reviewedAt = new Date();
  // A rejected rider is never left broadcasting a live position.
  fresh.status = 'offline';
  fresh.isOnline = false;
  await fresh.save();
  clearRiderLocation(userId);
  await UserModel.updateOne(
    { _id: userId },
    { $set: { isApproved: false, pendingApproval: false } },
  );
  const { RiderDocumentModel } = await import('../models');
  await RiderDocumentModel.updateMany(
    { rider: profile._id, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        reviewNote: reason,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
    },
  );
  await notifyUser(userId, {
    type: 'system',
    title: 'Application rejected',
    body: `Your rider application was rejected.${reason ? ` Reason: ${reason}` : ''}`,
  });
  sendSuccess(res, { rider: profile });
});

export const suspendRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  if (profile.approvalStatus !== 'approved') {
    throw new AppError('Only approved riders can be suspended', 422);
  }
  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.suspendedAt = new Date();
  fresh.status = 'offline';
  fresh.isOnline = false;
  await fresh.save();
  clearRiderLocation(userId);
  await UserModel.updateOne({ _id: userId }, { $set: { status: 'suspended', isApproved: false } });
  await notifyUser(userId, {
    type: 'system',
    title: 'Account suspended',
    body: 'Your rider account was suspended by the admin. Contact support for details.',
  });
  sendSuccess(res, { rider: profile });
});

export const activateRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  (fresh as any).suspendedAt = null;
  fresh.approvalStatus = 'approved';
  (fresh as any).reviewedBy = req.user._id;
  fresh.reviewedAt = new Date();
  await fresh.save();
  await UserModel.updateOne({ _id: userId }, { $set: { status: 'active', isApproved: true } });
  await notifyUser(userId, {
    type: 'system',
    title: 'Account reactivated',
    body: 'Your rider account has been reactivated. You can go online now.',
  });
  sendSuccess(res, { rider: profile });
});

// ---------------------------------------------------------------------------
// Admin rider management: approved photo, bike number, live map
// ---------------------------------------------------------------------------

/**
 * Set or replace a rider's approved profile photo.
 *
 * Admin-only by route guard. Riders have no endpoint that writes `avatarUrl`,
 * so this is the single way the approved photo ever changes; the previous
 * Cloudinary asset is deleted to avoid leaving orphans behind.
 */
export const uploadRiderAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const file = req.file;
  if (!file) throw new AppError('A photo file is required', 422);

  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');

  const previous = profile.avatarPublicId;
  const uploaded = await uploadToCloudinary(file, 'swat-city/riders/avatars');
  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.avatarUrl = uploaded.url;
  fresh.avatarPublicId = uploaded.publicId;
  (fresh as any).avatarUpdatedBy = req.user._id;
  fresh.avatarUpdatedAt = new Date();
  await fresh.save();
  profile.avatarUrl = fresh.avatarUrl;
  profile.avatarPublicId = fresh.avatarPublicId;

  if (previous && previous !== uploaded.publicId) {
    void deleteFromCloudinary(previous).catch(() => undefined);
  }

  await notifyUser(String(profile.user), {
    type: 'system',
    title: 'Profile photo updated',
    body: 'The admin updated your approved profile photo.',
  });

  sendSuccess(res, { rider: profile, avatarUrl: profile.avatarUrl });
});

/** Admin confirms/corrects the rider's bike registration number. */
export const adminUpdateVehiclePlate = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { vehiclePlate } = req.body as { vehiclePlate: string };
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');

  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  fresh.vehiclePlate = vehiclePlate;
  (fresh as any).vehiclePlateUpdatedBy = req.user._id;
  // An admin decision supersedes any rider proposal that was queued.
  (fresh as any).pendingVehicle = emptyPendingVehicle();
  await fresh.save();

  await notifyUser(String(profile.user), {
    type: 'system',
    title: 'Bike number updated',
    body: `Your registered bike number is now ${vehiclePlate}.`,
  });

  sendSuccess(res, { rider: profile });
});

const emptyPendingVehicle = () => ({
  vehicleType: null,
  vehicleBrand: null,
  vehiclePlate: null,
  requestedAt: null,
  note: null,
});

/**
 * Admin approves a rider's proposed vehicle change.
 *
 * The proposal is copied onto the live `vehicle*` fields — this is the only
 * path that lets a rider-chosen vehicle reach dispatch — and the queue entry is
 * cleared. A plate is re-checked here because another rider may have taken it
 * while this request waited.
 */
export const adminApproveVehicleChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const pending = (profile as any).pendingVehicle;
  if (!pending?.requestedAt) throw new AppError('This rider has no pending vehicle change', 409);

  if (pending.vehiclePlate) {
    const target = String(pending.vehiclePlate).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const others = await RiderProfileModel.find({ _id: { $ne: profile._id } })
      .select('vehiclePlate')
      .lean();
    for (const other of others) {
      const live = other.vehiclePlate
        ? String(other.vehiclePlate).toUpperCase().replace(/[^A-Z0-9]/g, '')
        : '';
      if (live === target) {
        throw new AppError('That registration number is now used by another rider', 409);
      }
    }
  }

  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  if (pending.vehicleType) fresh.vehicleType = pending.vehicleType;
  if (pending.vehicleBrand) fresh.vehicleBrand = pending.vehicleBrand;
  if (pending.vehiclePlate) {
    fresh.vehiclePlate = pending.vehiclePlate;
    (fresh as any).vehiclePlateUpdatedBy = req.user._id;
  }
  (fresh as any).pendingVehicle = emptyPendingVehicle();
  await fresh.save();

  await notifyUser(String(profile.user), {
    type: 'system',
    title: 'Vehicle change approved',
    body: `Your vehicle details were updated: ${pending.note ?? 'approved'}.`,
  });

  sendSuccess(res, { rider: fresh });
});

/** Admin rejects a rider's proposed vehicle change; the live fields stay put. */
export const adminRejectVehicleChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const pending = (profile as any).pendingVehicle;
  if (!pending?.requestedAt) throw new AppError('This rider has no pending vehicle change', 409);

  const { reason } = req.body as { reason?: string };

  const fresh = await findRiderProfile(req.params.id);
  if (!fresh) throw NOT_FOUND('Rider');
  (fresh as any).pendingVehicle = emptyPendingVehicle();
  await fresh.save();

  await notifyUser(String(profile.user), {
    type: 'system',
    title: 'Vehicle change rejected',
    body: reason?.trim()
      ? `Your vehicle update was rejected: ${reason.trim()}`
      : 'Your vehicle update was rejected. Your current details remain unchanged.',
  });

  sendSuccess(res, { rider: fresh });
});

/**
 * Riders for the admin live map.
 *
 * Only approved riders are returned, and only ones that have actually reported
 * a position. Offline riders carry no fix, so "no marker" is the honest signal
 * for them. Each row carries `lastLocationAt` so the UI can show how stale a
 * marker is instead of implying a rider is live when they are not.
 */
export const liveRiders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status } = req.query as { status?: string };

  const query: Record<string, unknown> = {
    approvalStatus: 'approved',
    'lastLocation.updatedAt': { $ne: null },
  };
  if (status && status !== 'all' && ['online', 'offline', 'busy'].includes(status)) {
    query.status = status;
  }

  const riders = await RiderProfileModel.find(query)
    .select('name avatarUrl photoUrl status lastLocation vehiclePlate vehicleType updatedAt')
    .populate('user', 'phone')
    .sort({ status: 1, updatedAt: -1 })
    .lean();

  sendSuccess(res, {
    riders: riders.map((r) => ({
      id: String(r.user),
      name: r.name,
      // Fall back to the photo the rider submitted at registration, so a rider
      // awaiting approval is not an anonymous dot on the map.
      avatarUrl: r.avatarUrl ?? r.photoUrl ?? null,
      status: r.status,
      phone: (r.user as unknown as { phone?: string } | undefined)?.phone ?? null,
      vehiclePlate: r.vehiclePlate ?? null,
      vehicleType: r.vehicleType,
      latitude: r.lastLocation?.lat ?? null,
      longitude: r.lastLocation?.lng ?? null,
      heading: r.lastLocation?.heading ?? 0,
      lastLocationAt: r.lastLocation?.updatedAt ?? null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// Ranges the panel may ask for. `quarter` covers the business quarter view
// (90 days); `year` is a rolling 360 - no calendar-month gymnastics.
const RANGE_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  quarter: 90,
  year: 360,
  all: 99999,
};

export const reports = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const range = String(req.query.range ?? '30d');
  const days = RANGE_DAYS[range] ?? 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const [orderRevenue, rideRevenue, totalOrders, totalRides, topRestaurants, categoryBreakdown] =
    await Promise.all([
      (async () => {
        const rows = await OrderModel.find({
          createdAt: { $gte: from },
          status: 'delivered',
        }).lean();
        return [{ total: rows.reduce((s, r: any) => s + (Number(r.total) || 0), 0) }];
      })(),
      (async () => {
        const rows = await RideModel.find({
          createdAt: { $gte: from },
          status: 'completed',
        }).lean();
        return [{ total: rows.reduce((s, r: any) => s + (Number(r.fare) || 0), 0) }];
      })(),
      OrderModel.countDocuments({ createdAt: { $gte: from } }),
      RideModel.countDocuments({ createdAt: { $gte: from } }),
      (async () => {
        const orders = await OrderModel.find({
          createdAt: { $gte: from },
          status: 'delivered',
        }).lean();
        const agg = new Map<string, { revenue: number; orders: number }>();
        for (const o of orders as any[]) {
          const rid = String(o.restaurant);
          const cur = agg.get(rid) || { revenue: 0, orders: 0 };
          cur.orders += 1;
          cur.revenue += Number(o.total) || 0;
          agg.set(rid, cur);
        }
        const top = Array.from(agg.entries())
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 5);
        const rids = top.map(([id]) => id);
        let rmap = new Map<string, any>();
        if (rids.length) {
          const rs = await RestaurantModel.find({ _id: { $in: rids } }).lean();
          rmap = new Map(rs.map((r: any) => [String(r._id), r]));
        }
        return top.map(([id, v]) => ({
          _id: id,
          name: rmap.get(id)?.name || id,
          revenue: v.revenue,
          orders: v.orders,
        }));
      })(),
      (async () => {
        const orders = await OrderModel.find({
          createdAt: { $gte: from },
          status: 'delivered',
        }).lean();
        const agg = new Map<string, number>();
        for (const o of orders as any[]) {
          const items = Array.isArray(o.items) ? o.items : [];
          for (const it of items) {
            const key = it?.name || it?._id || 'unknown';
            agg.set(
              key,
              (agg.get(key) || 0) + (Number(it?.price) || 0) * (Number(it?.quantity) || 1),
            );
          }
        }
        return Array.from(agg.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, total]) => ({ _id: id, total }));
      })(),
    ]);

  const foodRevenue = (orderRevenue[0] as any)?.total ?? 0;
  const rideRev = (rideRevenue[0] as any)?.total ?? 0;
  const revenue = Math.round(foodRevenue + rideRev);

  sendSuccess(res, {
    range,
    summary: {
      revenue,
      orders: totalOrders,
      rides: totalRides,
      foodShare:
        totalOrders + totalRides > 0
          ? Math.round((totalOrders / (totalOrders + totalRides)) * 100)
          : 0,
    },
    topRestaurants,
    topDishes: categoryBreakdown,
    serviceBreakdown: [
      { label: 'Food', value: totalOrders },
      { label: 'Ride', value: totalRides },
    ],
  });
});
