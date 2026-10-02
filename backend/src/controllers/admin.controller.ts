import type { Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import {
  OrderModel,
  RestaurantModel,
  RiderProfileModel,
  RideModel,
  SupportTicketModel,
  UserModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import { notifyUser } from '../services/notification.service';
import { paginationMeta } from '../utils/helpers';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

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
  const rows = await model.aggregate<{ total: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: 'delivered' } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  return rows[0]?.total ?? 0;
}

async function sumCompletedRideFareBetween(model: typeof RideModel, from: Date, to: Date) {
  const rows = await model.aggregate<{ total: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$fare' } } },
  ]);
  return rows[0]?.total ?? 0;
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
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // Per-day series for charts
  const dailyOrders: { label: string; count: number }[] = [];
  const weeklyRevenue: { label: string; value: number }[] = [];
  const customerGrowth: { label: string; count: number }[] = [];
  const riderGrowth: { label: string; count: number }[] = [];
  let foodCount = 0;
  let rideCount = 0;

  for (const { day, next } of dayBuckets) {
    const [orders, rides, newCustomers, newRiders, dayFood, dayRide, dayOrderRevenue, dayRideRevenue] =
      await Promise.all([
        OrderModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        RideModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        UserModel.countDocuments({ role: 'customer', createdAt: { $gte: day, $lt: next } }),
        UserModel.countDocuments({ role: 'rider', createdAt: { $gte: day, $lt: next } }),
        OrderModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        RideModel.countDocuments({ createdAt: { $gte: day, $lt: next } }),
        sumDeliveredRevenueBetween(OrderModel, day, next),
        sumCompletedRideFareBetween(RideModel, day, next),
      ]);
    dailyOrders.push({ label: dayLabel(day), count: orders });
    weeklyRevenue.push({ label: dayLabel(day), value: Math.round(dayOrderRevenue + dayRideRevenue) });
    customerGrowth.push({ label: dayLabel(day), count: newCustomers });
    riderGrowth.push({ label: dayLabel(day), count: newRiders });
    foodCount += dayFood;
    rideCount += dayRide;
  }

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) statusMap[s._id] = s.count;

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
    UserModel.find(query).select('-password -deviceTokens').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    UserModel.countDocuments(query),
  ]);
  sendSuccess(res, { users }, paginationMeta(p, l, total));
});

export const updateUserStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.params.id === req.user._id) throw new AppError('You cannot suspend your own account', 422);
  const user = await UserModel.findById(req.params.id);
  if (!user) throw NOT_FOUND('User');
  user.status = req.body.status;
  await user.save();

  await notifyUser(String(user._id), {
    type: 'system',
    title: user.status === 'suspended' ? 'Account suspended' : 'Account reactivated',
    body:
      user.status === 'suspended'
        ? 'Your account has been suspended. Contact support if you believe this is a mistake.'
        : 'Your account has been reactivated. Welcome back!',
  });
  sendSuccess(res, { updated: { id: user._id, status: user.status } });
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

async function RiderDocumentModelFind(profileId: Types.ObjectId | string) {
  // dynamic import avoids pulling the model into the module graph twice
  const { RiderDocumentModel } = await import('../models');
  return RiderDocumentModel.find({ rider: profileId }).sort('-createdAt').lean();
}

/** Resolve a RiderProfile by either its own _id or its linked User id. */
export function findRiderProfile(id: string) {
  const or: Array<Record<string, unknown>> = [];
  if (isValidObjectId(id)) or.push({ _id: id });
  or.push({ user: id });
  return RiderProfileModel.findOne({ $or: or });
}

/** Approve / reject a rider by their User id. */
export const reviewRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { approvalStatus, note } = req.body as { approvalStatus?: 'approved' | 'rejected'; note?: string };

  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  if (!approvalStatus || (approvalStatus !== 'approved' && approvalStatus !== 'rejected')) {
    throw new AppError('approvalStatus must be approved or rejected', 422);
  }

  profile.approvalStatus = approvalStatus;
  if (note) {
    const { RiderDocumentModel } = await import('../models');
    await RiderDocumentModel.updateMany(
      { rider: profile._id, status: 'pending' },
      { $set: { status: approvalStatus, reviewNote: note, reviewedBy: req.user._id, reviewedAt: new Date() } },
    );
  }
  await profile.save();
  await UserModel.updateOne({ _id: userId }, { $set: { isApproved: approvalStatus === 'approved', pendingApproval: false } });

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
  profile.approvalStatus = 'approved';
  profile.status = 'offline';
  await profile.save();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { isApproved: true, pendingApproval: false, status: 'active' } },
  );
  await notifyUser(userId, {
    type: 'system',
    title: 'You are approved!',
    body: 'Congratulations! You can now go online and start delivering.',
  });
  sendSuccess(res, { rider: profile });
});

export const rejectRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { reason } = req.body as { reason?: string };
  const profile = await findRiderProfile(req.params.id);
  if (!profile) throw NOT_FOUND('Rider');
  const userId = String(profile.user);
  profile.approvalStatus = 'rejected';
  await profile.save();
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
  profile.status = 'offline';
  profile.suspendedAt = new Date();
  await profile.save();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { status: 'suspended', isApproved: false } },
  );
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
  profile.suspendedAt = undefined;
  profile.approvalStatus = 'approved';
  await profile.save();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { status: 'active', isApproved: true } },
  );
  await notifyUser(userId, {
    type: 'system',
    title: 'Account reactivated',
    body: 'Your rider account has been reactivated. You can go online now.',
  });
  sendSuccess(res, { rider: profile });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const RANGE_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  month: 90,
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
      OrderModel.aggregate<{ total: number }>([
        { $match: { createdAt: { $gte: from }, status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      RideModel.aggregate<{ total: number }>([
        { $match: { createdAt: { $gte: from }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare' } } },
      ]),
      OrderModel.countDocuments({ createdAt: { $gte: from } }),
      RideModel.countDocuments({ createdAt: { $gte: from } }),
      OrderModel.aggregate<{ _id: Types.ObjectId; name: string; revenue: number; orders: number }>([
        { $match: { createdAt: { $gte: from }, status: 'delivered' } },
        { $group: { _id: '$restaurant', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: { from: 'restaurants', localField: '_id', foreignField: '_id', as: 'r' },
        },
        {
          $project: {
            _id: 1,
            name: { $arrayElemAt: ['$r.name', 0] },
            revenue: 1,
            orders: 1,
          },
        },
      ]),
      OrderModel.aggregate<{ _id: string; total: number }>([
        { $match: { createdAt: { $gte: from }, status: 'delivered' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
    ]);

  const foodRevenue = orderRevenue[0]?.total ?? 0;
  const rideRev = rideRevenue[0]?.total ?? 0;
  const revenue = Math.round(foodRevenue + rideRev);

  sendSuccess(res, {
    range,
    summary: {
      revenue,
      orders: totalOrders,
      rides: totalRides,
      foodShare: totalOrders + totalRides > 0 ? Math.round((totalOrders / (totalOrders + totalRides)) * 100) : 0,
    },
    topRestaurants,
    topDishes: categoryBreakdown,
    serviceBreakdown: [
      { label: 'Food', value: totalOrders },
      { label: 'Ride', value: totalRides },
    ],
  });
});