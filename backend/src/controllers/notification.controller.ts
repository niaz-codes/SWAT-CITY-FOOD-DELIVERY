import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { UNAUTHORIZED } from '../utils/AppError';
import { listNotifications, markAllRead, markRead } from '../services/notification.service';

export const listNotificationsCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const result = await listNotifications(req.user._id, page, limit);
  sendSuccess(res, result, { page, limit, total: result.total });
});

export const markAllReadCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  await markAllRead(req.user._id);
  sendSuccess(res, { markedAll: true });
});

export const markReadCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const notification = await markRead(req.user._id, req.params.id);
  sendSuccess(res, { notification });
});

export const unreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const result = await listNotifications(req.user._id, 1, 1);
  sendSuccess(res, { unread: result.unread });
});
