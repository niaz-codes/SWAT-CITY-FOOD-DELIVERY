import type { Response } from 'express';
import {
  OrderModel,
  RestaurantModel,
  ReviewModel,
  RideModel,
  UserModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { UNAUTHORIZED } from '../utils/AppError';

/**
 * Platform-wide analytics for the admin panel — the market-wide sibling of the
 * restaurant portal's `myReports`. One window at a time (same range keys),
 * compared against the window immediately before it, so the panel can draw
 * trend arrows instead of raw counters.
 *
 * Revenue = delivered food orders' totals only (pending/unpaid orders never
 * count), matching the definition everywhere else in the product.
 */
const ANALYTICS_RANGE_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  quarter: 90,
};

function windowFrom(days: number): Date {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return from;
}

export const platformAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const range = String(req.query.range ?? '7d');
  const days = ANALYTICS_RANGE_DAYS[range] ?? 7;
  const daysNumber = days;

  const from = windowFrom(daysNumber);
  const previousFrom = windowFrom(daysNumber * 2);
  const previousTo = from;

  const orders = await OrderModel.find({ createdAt: { $gte: previousFrom } })
    .select('status total createdAt customer restaurant items rider distanceKm')
    .lean();

  const inWindow = (o: any, fromD: Date, toD?: Date) => {
    const t = new Date(o.createdAt).getTime();
    return t >= fromD.getTime() && (toD ? t < toD.getTime() : true);
  };
  const currentOrders = (orders as any[]).filter((o) => inWindow(o, from));
  const previousOrders = (orders as any[]).filter((o) => inWindow(o, previousFrom, previousTo));
  const delivered = currentOrders.filter((o) => o.status === 'delivered');
  const deliveredPrevious = previousOrders.filter((o) => o.status === 'delivered');

  const revenue = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const revenuePrevious = deliveredPrevious.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const pct = (now: number, before: number): number | null => {
    if (!before) return null;
    return Math.round(((now - before) / before) * 100);
  };

  // Daily series (orders of any status count as activity; revenue only ships
  // on delivery) — the same shape the portal reports and the Charts component
  // already consume.
  const series = new Map<string, { orders: number; revenue: number; customers: Set<string> }>();
  for (const o of currentOrders) {
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    const cur = series.get(key) ?? { orders: 0, revenue: 0, customers: new Set<string>() };
    cur.orders += 1;
    if (o.status === 'delivered') cur.revenue += Number(o.total) || 0;
    if (o.customer) cur.customers.add(String(o.customer));
    series.set(key, cur);
  }
  const seriesRows = Array.from(series.keys())
    .sort()
    .map((date) => ({
      date,
      orders: series.get(date)!.orders,
      revenue: Math.round(series.get(date)!.revenue),
      uniqueCustomers: series.get(date)!.customers.size,
    }));

  // Top entities within the window.
  const dishes = new Map<string, { id: string | null; name: string; qty: number }>();
  const restaurantTotals = new Map<string, { orders: number; revenue: number }>();
  const riderTotals = new Map<string, { trips: number; km: number }>();
  for (const o of delivered) {
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const id = it?.foodItem ? String(it.foodItem) : null;
      const key = id ?? String(it?.name ?? 'unknown').toLowerCase();
      const cur = dishes.get(key) ?? { id, name: String(it?.name ?? 'Unknown'), qty: 0 };
      cur.qty += Number(it?.quantity) || 1;
      dishes.set(key, cur);
    }
    if (o.restaurant) {
      const r = restaurantTotals.get(String(o.restaurant)) ?? { orders: 0, revenue: 0 };
      r.orders += 1;
      r.revenue += Number(o.total) || 0;
      restaurantTotals.set(String(o.restaurant), r);
    }
    if (o.rider) {
      const r = riderTotals.get(String(o.rider)) ?? { trips: 0, km: 0 };
      r.trips += 1;
      r.km += Number(o.distanceKm) || 0;
      riderTotals.set(String(o.rider), r);
    }
  }

  const topRestaurantIds = Array.from(restaurantTotals.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8);
  const topRiderIds = Array.from(riderTotals.entries())
    .sort((a, b) => b[1].trips - a[1].trips)
    .slice(0, 8);

  const [restaurants, riders, ridesCompleted, newCustomers] = await Promise.all([
    RestaurantModel.find({ _id: { $in: topRestaurantIds.map(([id]) => id) } })
      .select('name emoji')
      .lean(),
    UserModel.find({ _id: { $in: topRiderIds.map(([id]) => id) }, role: 'rider' })
      .select('name phone')
      .lean(),
    RideModel.countDocuments({ status: 'completed', createdAt: { $gte: from } }),
    UserModel.countDocuments({
      role: 'customer',
      createdAt: { $gte: from },
    }),
  ]);

  const restaurantName = new Map<string, string>(
    (restaurants as any[]).map((r) => [String(r._id), String(r.name ?? 'Restaurant')]),
  );
  const riderName = new Map<string, string>(
    (riders as any[]).map((r) => [String(r._id), String(r.name ?? 'Rider')]),
  );

  const cancelledCount = currentOrders.filter((o) => o.status === 'cancelled').length;
  const avgOrder = delivered.length ? Math.round(revenue / delivered.length) : 0;

  // Restaurant reply coverage is the panel's signal that partner engagement
  // (the review-reply feature) is actually being used.
  const reviewStats = await ReviewModel.find({ createdAt: { $gte: from } })
    .select('reply')
    .lean();
  const reviewsTotal = (reviewStats as any[]).length;

  sendSuccess(res, {
    range,
    from: from.toISOString(),
    summary: {
      revenue: Math.round(revenue),
      revenueChangePct: pct(revenue, revenuePrevious),
      deliveredOrders: delivered.length,
      ordersChangePct: pct(delivered.length, deliveredPrevious.length),
      cancelled: cancelledCount,
      avgOrder,
      completedRides: ridesCompleted,
      newCustomers,
      reviews: reviewsTotal,
      reviewsReplied: (reviewStats as any[]).filter((r) => r.reply).length,
    },
    series: seriesRows,
    topRestaurants: topRestaurantIds.map(([id, agg]) => ({
      id,
      name: restaurantName.get(id) ?? 'Restaurant',
      orders: agg.orders,
      revenue: Math.round(agg.revenue),
    })),
    topRiders: topRiderIds.map(([id, agg]) => ({
      id,
      name: riderName.get(id) ?? 'Rider',
      trips: agg.trips,
      km: Math.round(agg.km * 10) / 10,
    })),
    topDishes: Array.from(dishes.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8),
  });
});
