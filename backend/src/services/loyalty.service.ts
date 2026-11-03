import { CustomerProfileModel, type CustomerProfile } from '../models';
import { AppError, BAD_REQUEST } from '../utils/AppError';
import { getSetting } from './settings.service';

/**
 * Loyalty program.
 *
 * Customers earn points on DELIVERED food orders (footer of the order flow):
 * `loyalty_points_per_hundred` points per Rs 100 of subtotal. Points are spent
 * at checkout as a discount: each point removes `loyalty_point_value` rupees,
 * never more than `loyalty_max_percent` of the subtotal (so fees are always
 * covered by real money). Settings are admin-editable via the app_settings
 * table with conservative platform defaults enforced here.
 */
export interface LoyaltyConfig {
  /** Points granted per Rs 100 of order subtotal. */
  earnRate: number;
  /** Rupees discounted per redeemed point. */
  pointValue: number;
  /** Upper bound (percent of subtotal) a checkout may pay with points. */
  maxPercent: number;
}

export const LOYALTY_DEFAULTS: LoyaltyConfig = {
  earnRate: 5,
  pointValue: 1,
  maxPercent: 30,
};

export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  const [earnRate, pointValue, maxPercent] = await Promise.all([
    getSetting<number>('loyalty_points_per_hundred'),
    getSetting<number>('loyalty_point_value'),
    getSetting<number>('loyalty_max_percent'),
  ]);
  const clamp = (n: unknown, fallback: number, min: number, max: number): number => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  };
  return {
    earnRate: clamp(earnRate, LOYALTY_DEFAULTS.earnRate, 1, 100),
    pointValue: clamp(pointValue, LOYALTY_DEFAULTS.pointValue, 0.5, 100),
    maxPercent: clamp(maxPercent, LOYALTY_DEFAULTS.maxPercent, 1, 60),
  };
}

/** Pure: points a delivered order's subtotal earns (floored, never negative). */
export function pointsEarnable(subtotal: number, earnRate: number): number {
  const s = Math.max(0, Number(subtotal) || 0);
  return Math.floor((s / 100) * earnRate);
}

/**
 * Pure: the discount (Rs) produced by redeeming `points` on a subtotal `s`.
 * The count is clamped to what the subtotal can legally bank (max percent cap
 * AND never more than the subtotal itself), so checkout can quote this directly.
 */
export function pointsDiscountFor(
  requestedPoints: number,
  subtotal: number,
  config: LoyaltyConfig,
): { points: number; discount: number } {
  const requested = Math.max(0, Math.floor(Number(requestedPoints) || 0));
  if (requested === 0 || !Number.isFinite(subtotal) || subtotal <= 0) {
    return { points: 0, discount: 0 };
  }
  const capToSubtotal = Math.floor(subtotal / config.pointValue);
  const capToPercent = Math.floor((subtotal * config.maxPercent) / 100 / config.pointValue);
  const points = Math.min(requested, capToSubtotal, capToPercent);
  return { points, discount: Math.round(points * config.pointValue * 100) / 100 };
}

/** Pure: reject a scheduled-for timestamp outside the allowed window. */
export function scheduledForError(
  input: unknown,
  now: Date = new Date(),
  opts: { minLeadMinutes?: number; maxDays?: number } = {},
): string | null {
  const min = new Date(now.getTime() + (opts.minLeadMinutes ?? 30) * 60_000);
  const max = new Date(now.getTime() + (opts.maxDays ?? 7) * 86_400_000);
  // Absent is the normal immediate-order case.
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(String(input));
  if (Number.isNaN(d.getTime())) return 'Scheduled time is not a valid date';
  if (d.getTime() < min.getTime()) return 'Scheduled time must be at least 30 minutes ahead';
  if (d.getTime() > max.getTime()) return 'Scheduled time may not be more than 7 days ahead';
  return null;
}

/** Balance lookup for the checkout screen (null-safe; riders have no profile). */
export async function loyaltyBalanceFor(customerId: string): Promise<number> {
  const profile = (await CustomerProfileModel.findOne({
    user: customerId,
  }).lean()) as CustomerProfile | null;
  return Math.max(0, Math.floor(profile?.loyaltyPoints ?? 0));
}

/**
 * Atomically deducts redeemed points from the customer's balance — compare-
 * and-set on the balance itself, so two concurrent checkouts can never
 * overdraw (the loser gets 402). Caller passes an already-validated count.
 */
export async function debitLoyaltyPoints(
  customerId: string,
  points: number,
): Promise<void> {
  if (!Number.isFinite(points) || points <= 0) return;
  const updated = await CustomerProfileModel.findOneAndUpdate(
    { user: customerId, loyaltyPoints: { $gte: points } as any },
    { $inc: { loyaltyPoints: -points } as any },
    { new: true },
  );
  if (!updated) {
    throw new AppError('Not enough loyalty points for this redemption', 402);
  }
}

/**
 * Refunds redeemed points when an order that consumed them is cancelled
 * (points were spent and the food never arrived → balance is restored).
 */
export async function refundLoyaltyPoints(
  customerId: string,
  points: number,
): Promise<void> {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  if (n === 0) return;
  await CustomerProfileModel.updateOne(
    { user: customerId },
    { $inc: { loyaltyPoints: n } as any },
  );
}

/**
 * Credits earned points on delivery — compare-and-set on the earned count so a
 * retried / concurrent "delivered" transition can never award twice.
 */
export async function awardLoyaltyPoints(
  order: { _id: unknown; customer: unknown; subtotal: number; loyaltyPointsEarned?: number | null },
  config?: LoyaltyConfig,
): Promise<number> {
  if (Number(order.loyaltyPointsEarned ?? 0) > 0) return 0; // already settled
  const cfg = config ?? (await getLoyaltyConfig());
  const earned = Math.max(0, pointsEarnable(order.subtotal, cfg.earnRate));
  if (earned === 0) return 0;
  const updated = await CustomerProfileModel.findOneAndUpdate(
    { user: String(order.customer) },
    { $inc: { loyaltyPoints: earned } as any },
    { new: true },
  );
  if (updated) return earned;
  // No profile row (edge: account cleaned up) — nothing to credit into.
  return 0;
}

/** Validates a redemption request against the caller's real balance. */
export async function assertRedeemable(
  customerId: string,
  requestedPoints: number,
): Promise<void> {
  const requested = Math.floor(Number(requestedPoints) || 0);
  if (requested === 0) return;
  if (requested < 0) throw BAD_REQUEST('Invalid loyalty points redemption');
  const balance = await loyaltyBalanceFor(customerId);
  if (requested > balance) {
    throw new AppError(`You only have ${balance} loyalty points available`, 402);
  }
}
