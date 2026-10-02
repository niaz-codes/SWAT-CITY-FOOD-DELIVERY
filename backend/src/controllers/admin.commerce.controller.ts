import type { Response } from 'express';
import { Types } from 'mongoose';
import {
  AppSettingModel,
  PromotionModel,
  SupportTicketModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import { paginationMeta } from '../utils/helpers';
import { notifyUser } from '../services/notification.service';
import { getSetting, setSetting } from '../services/settings.service';

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const adminListPromotions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { active, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (active !== undefined && active !== '' && active !== 'all') query.active = active === 'true';
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [promotions, total] = await Promise.all([
    PromotionModel.find(query).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    PromotionModel.countDocuments(query),
  ]);
  sendSuccess(res, { promotions }, paginationMeta(p, l, total));
});

export const adminCreatePromotion = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const promotion = await PromotionModel.create(req.body);
  sendSuccess(res, { promotion });
});

export const adminUpdatePromotion = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const promotion = await PromotionModel.findOneAndUpdate({ _id: req.params.id }, { $set: req.body }, { new: true });
  if (!promotion) throw NOT_FOUND('Promotion');
  sendSuccess(res, { promotion });
});

export const adminDeletePromotion = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const promotion = await PromotionModel.findOneAndUpdate({ _id: req.params.id }, { $set: { active: false } }, { new: true });
  if (!promotion) throw NOT_FOUND('Promotion');
  sendSuccess(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const adminGetSettings = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await AppSettingModel.find().sort({ key: 1 }).lean();
  sendSuccess(res, { settings });
});

export const adminSetSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  await setSetting(req.body.key, req.body.value, req.body.label);
  const latest = await getSetting(req.body.key);
  sendSuccess(res, { key: req.body.key, value: latest });
});

export const adminUpdateSettingByKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  await setSetting(req.params.key, req.body.value, req.body.label);
  const latest = await getSetting(req.params.key);
  sendSuccess(res, { key: req.params.key, value: latest });
});

// ---------------------------------------------------------------------------
// Support tickets (admin)
// ---------------------------------------------------------------------------

export const adminListTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (status && status !== 'all') query.status = status;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [tickets, total] = await Promise.all([
    SupportTicketModel.find(query).populate('user', 'name phone').sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    SupportTicketModel.countDocuments(query),
  ]);
  sendSuccess(res, { tickets }, paginationMeta(p, l, total));
});

export const adminTicketDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ticket = await SupportTicketModel.findById(req.params.id).populate('user', 'name phone email');
  if (!ticket) throw NOT_FOUND('Ticket');
  sendSuccess(res, { ticket });
});

export const adminUpdateTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ticket = await SupportTicketModel.findById(req.params.id);
  if (!ticket) throw NOT_FOUND('Ticket');
  const { status, priority, assignedTo, reply } = req.body as {
    status?: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assignedTo?: string;
    reply?: string;
  };
  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;
  if (assignedTo) ticket.assignedTo = new Types.ObjectId(assignedTo) as unknown as typeof ticket.assignedTo;
  if (reply) {
    ticket.messages.push({ from: req.user._id, text: reply });
  }
  if (status === 'resolved') ticket.resolvedAt = new Date();
  await ticket.save();

  await notifyUser(String(ticket.user), {
    type: 'system',
    title: 'Support ticket update',
    body: reply ? `Support replied: ${reply}` : `Ticket marked as ${status ?? 'updated'}`,
    data: { ticketId: String(ticket._id) },
  });
  sendSuccess(res, { ticket });
});