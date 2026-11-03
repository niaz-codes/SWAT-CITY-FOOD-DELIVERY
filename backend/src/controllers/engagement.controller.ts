import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../utils/respond';
import { sendOrderMessage, listOrderMessages, unreadCountFor } from '../services/chat.service';
import {
  getLoyaltyConfig,
  loyaltyBalanceFor,
  pointsEarnable,
  pointsDiscountFor,
} from '../services/loyalty.service';
import { referralStatsFor } from '../services/referral.service';

// ---------------------------------------------------------------------------
// Chat (per-order threads)
// ---------------------------------------------------------------------------

/** POST /chat/orders/:orderId/messages — send a message to the order thread. */
export const postChatMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new Error('unreachable'); // requireAuth guarantees a user
  const { message, recipientId } = await sendOrderMessage({
    orderId: String(req.params.id),
    senderId: String(req.user._id),
    body: (req.body as { body?: string }).body ?? '',
  });
  void recipientId;
  sendCreated(res, { message });
});

/** GET /chat/orders/:orderId/messages — full thread (marks it read for me). */
export const getChatThread = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new Error('unreachable');
  const page = Number(req.query.page) || 1;
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const thread = await listOrderMessages(String(req.params.id), String(req.user._id), {
    page,
    limit,
  });
  sendSuccess(res, thread);
});

/** GET /chat/unread-count — total unread chat messages for my account. */
export const getChatUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new Error('unreachable');
  const unread = await unreadCountFor(String(req.user._id));
  sendSuccess(res, { unread });
});

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

/**
 * GET /engagement/loyalty — balance + program rules for the checkout screen.
 * Customers only; other roles get zeros rather than a 403 so a shared screen
 * component can render for everyone.
 */
export const getLoyaltyOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const config = await getLoyaltyConfig();
  if (!req.user) throw new Error('unreachable');
  const balance =
    (req.user as { role?: string }).role === 'customer'
      ? await loyaltyBalanceFor(String(req.user._id))
      : 0;
  const demoSubtotal = 100;
  sendSuccess(res, {
    balance,
    config,
    /** One point removes `pointValue` rupees. */
    pointWorth: config.pointValue,
    /** Demonstration of the earn rule: order at Rs 100 earns this many points. */
    earnPerHundred: pointsEarnable(demoSubtotal, config.earnRate),
    /** Helper to quote a redemption client-side before checkout. */
    previewFor: (subtotal: number) => pointsDiscountFor(balance, subtotal, config),
  } satisfies Record<string, unknown>);
});

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

/** GET /engagement/referrals — my share code, invitees and earnings to date. */
export const getReferralOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new Error('unreachable');
  const stats = await referralStatsFor(String(req.user._id));
  sendSuccess(res, stats);
});
