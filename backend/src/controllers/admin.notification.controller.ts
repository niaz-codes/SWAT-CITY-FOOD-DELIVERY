import type { Response } from 'express';
import { NotificationBroadcastModel } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { UNAUTHORIZED } from '../utils/AppError';
import { paginationMeta } from '../utils/helpers';
import { broadcastNotification, type BroadcastInput } from '../services/notification.service';

// ---------------------------------------------------------------------------
// Admin broadcast notifications
// ---------------------------------------------------------------------------

/** Paginated broadcast history (newest first) for the admin Notifications tab. */
export const adminListNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { audience, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (audience && audience !== 'all') query.audience = audience;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [notifications, total] = await Promise.all([
    NotificationBroadcastModel.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    NotificationBroadcastModel.countDocuments(query),
  ]);

  sendSuccess(res, { notifications }, paginationMeta(p, l, total));
});

/**
 * Send a broadcast: fan out in-app rows + socket emits + Expo pushes, then
 * record the send in the history table. A history-write failure (e.g. the
 * table has not been migrated yet) is logged but must not fail an already
 * delivered fan-out.
 */
export const adminSendNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();

  const { title, body, audience } = req.body as BroadcastInput;
  const result = await broadcastNotification({ title, body, audience });

  let broadcast = null;
  try {
    broadcast = await NotificationBroadcastModel.create({
      title,
      body,
      audience,
      sentBy: req.user._id,
      status: 'sent',
      recipients: result.recipients,
      pushed: result.pushed,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[admin] broadcast history record failed:', (error as Error).message);
  }

  sendSuccess(res, { broadcast, ...result });
});
