import { randomBytes } from 'node:crypto';
import { OrderModel, UserModel, WalletTransactionModel } from '../models';
import { AppError, BAD_REQUEST, NOT_FOUND } from '../utils/AppError';
import { creditWallet } from './wallet.service';
import { getSetting } from './settings.service';

/**
 * Referral program.
 *
 * Every customer gets their own share code (assigned at signup). A new
 * customer may paste someone else's code while registering: their account is
 * stamped `referredBy`. When the REFERRED customer's FIRST food order is
 * delivered, both sides are credited `referral_reward` rupees into their
 * wallet — referrer for bringing a new, REAL customer; referee as a welcome
 * bonus. The award is ledger-idempotent: wallet transaction descriptions are
 * keyed on the unique order number, so a replayed delivery can never pay out
 * twice (same pattern as cancelled-order refunds and rider payouts).
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusables
export const CODE_LENGTH = 6;

export const DEFAULT_REFERRAL_REWARD = 100;

/** Pure: builds a candidate share code (collision-checked by the caller). */
export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

/**
 * Assigns a unique referral code to a customer at signup. Retries against
 * (the astronomically unlikely) code collision. Never throws — a signup must
 * not fail because of a referral-cosmetic race; the caller ignores errors.
 */
export async function ensureReferralCode(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await UserModel.findById(userId).select('referralCode').lean();
    if (existing?.referralCode) return;
    const code = generateReferralCode();
    try {
      await UserModel.updateOne({ _id: userId }, { $set: { referralCode: code } });
      // Race-loser check: re-read — if a concurrent attempt won, its code stands.
      const after = await UserModel.findById(userId).select('referralCode').lean();
      if (after?.referralCode) return;
    } catch {
      // Duplicate key on the partial unique index → loop and draw again.
    }
  }
}

/**
 * Resolves a referral code typed at signup to the referrer's user id.
 * Codes are compared case-insensitively; an unknown/invalid code is silently
 * ignored (a typo must not fail a signup) unless `required` is set.
 */
export async function resolveReferral(
  codeInput: string | undefined,
  opts: { required?: boolean } = {},
): Promise<string | null> {
  const code = String(codeInput ?? '').trim().toUpperCase();
  if (!code) {
    if (opts.required) throw BAD_REQUEST('A referral code is required');
    return null;
  }
  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    if (opts.required) throw BAD_REQUEST('Referral code looks invalid');
    return null;
  }
  const referrer = await UserModel.findOne({
    referralCode: code,
    role: 'customer',
    status: 'active',
    deletedAt: null,
  }).lean();
  if (!referrer) {
    if (opts.required) throw NOT_FOUND('Referral code not recognised');
    return null;
  }
  return String(referrer._id);
}

/** Public stats for the "invite friends" screen. */
export async function referralStatsFor(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user || user.role !== 'customer') {
    throw new AppError('Referrals are for customers only', 403);
  }
  const code = user.referralCode ?? (await ensureReferralCode(userId), user.referralCode);
  const refreshed = code ? (await UserModel.findById(userId).select('referralCode').lean())?.referralCode : null;
  const referredUsers = await UserModel.find({ referredBy: userId })
    .select('name phone createdAt')
    .lean();
  const rewardSetting = await getSetting<number>('referral_reward');
  const reward = Number.isFinite(Number(rewardSetting))
    ? Number(rewardSetting)
    : DEFAULT_REFERRAL_REWARD;
  // Both "legs" (referrer + welcome) are named after each delivered order; the
  // referrer's earned total is simply reward × referred-customers-with-a-
  // delivered-first-order — no regex-ledger scanning needed.
  const referredIds = referredUsers.map((u: any) => String(u._id));
  let paidReferrals = 0;
  for (const rid of referredIds) {
    const hasDelivered = await OrderModel.exists({ customer: rid, status: 'delivered' });
    if (hasDelivered) paidReferrals++;
  }
  return {
    code: refreshed ?? null,
    reward,
    referredCount: referredUsers.length,
    earned: paidReferrals * reward,
    referred: referredUsers.map((u: any) => ({
      id: u._id,
      name: u.name,
      joinedAt: u.createdAt,
    })),
  };
}

/**
 * Called when an order is delivered. Awards the referral bonus when this is
 * the REFERRAL LOGIN's first EVER delivered order. Impotent-safe: the wallet
 * ledger lookup by description is the idempotency guard.
 */
export async function awardReferralOnDelivered(order: {
  _id: unknown;
  orderNumber?: string | null;
  customer: unknown;
  status?: string;
}): Promise<void> {
  if (order.status !== 'delivered') return;
  const customer = await UserModel.findById(String(order.customer)).lean();
  if (!customer?.referredBy) return;
  const referrerId = String(customer.referredBy);
  if (referrerId === String(customer._id)) return;

  const priorDelivered = await OrderModel.exists({
    customer: String(customer._id),
    status: 'delivered',
    _id: { $ne: String(order._id) },
  });
  // Any delivered order besides this one already paid the program out.
  if (priorDelivered) return;

  const rewardSetting = await getSetting<number>('referral_reward');
  const reward = Number.isFinite(Number(rewardSetting))
    ? Math.max(0, Number(rewardSetting))
    : DEFAULT_REFERRAL_REWARD;
  if (reward <= 0) return;

  const legs: Array<{ userId: string; description: string }> = [
    {
      userId: referrerId,
      description: `Referral reward for order ${order.orderNumber} (referrer)`,
    },
    {
      userId: String(customer._id),
      description: `Referral reward for order ${order.orderNumber} (welcome)`,
    },
  ];
  for (const leg of legs) {
    const already = await WalletTransactionModel.findOne({
      user: leg.userId,
      description: leg.description,
    });
    if (already) continue;
    await creditWallet(leg.userId, reward, 'credit', {
      reference: 'referral',
      referenceModel: 'Order',
      description: leg.description,
      metadata: { orderId: String(order._id) },
    }).catch(() => undefined);
  }
}
