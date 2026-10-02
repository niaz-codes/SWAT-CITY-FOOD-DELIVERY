import type { Response } from 'express';
import {
  OrderModel,
  PaymentModel,
  RideModel,
  WalletModel,
  WalletTransactionModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import { paginationMeta } from '../utils/helpers';
import {
  advanceOrderStatus,
  cancelOrder,
  assignRiderToOrder,
} from '../services/order.service';
import { advanceRide, cancelRide } from '../services/ride.service';
import { listWalletTransactions } from '../services/wallet.service';

// ---------------------------------------------------------------------------
// Orders (admin)
// ---------------------------------------------------------------------------

export const adminListOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, search, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = { deletedAt: null };
  if (status && status !== 'all') query.status = status;
  if (search) query.orderNumber = { $regex: String(search), $options: 'i' };
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .populate('customer', 'name phone')
      .populate('restaurant', 'name emoji gradient')
      .populate('rider', 'name phone')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    OrderModel.countDocuments(query),
  ]);
  sendSuccess(res, { orders }, paginationMeta(p, l, total));
});

export const adminOrderDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('restaurant', 'name emoji gradient phone addressLine area')
    .populate('rider', 'name phone avatarUrl')
    .populate('payment');
  if (!order) throw NOT_FOUND('Order');
  sendSuccess(res, { order });
});

export const adminAdvanceOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const order = await OrderModel.findById(req.params.id);
  if (!order) throw NOT_FOUND('Order');
  const next = req.body.status as Parameters<typeof advanceOrderStatus>[1];
  const updated = await advanceOrderStatus(req.params.id, next, req.user._id);
  sendSuccess(res, { order: updated });
});

export const adminCancelOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const updated = await cancelOrder({
    orderId: req.params.id,
    actorId: req.user._id,
    by: 'admin',
    reason: req.body.reason ?? 'Cancelled by admin',
  });
  sendSuccess(res, { order: updated });
});

export const adminAssignRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { riderId } = req.body as { riderId?: string };
  if (!riderId) throw new AppError('riderId is required', 422);
  const order = await assignRiderToOrder(req.params.id, riderId);
  sendSuccess(res, { order });
});

// ---------------------------------------------------------------------------
// Rides (admin)
// ---------------------------------------------------------------------------

export const adminListRides = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (status && status !== 'all') query.status = status;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [rides, total] = await Promise.all([
    RideModel.find(query).populate('customer', 'name phone').populate('rider', 'name phone').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    RideModel.countDocuments(query),
  ]);
  sendSuccess(res, { rides }, paginationMeta(p, l, total));
});

export const adminCancelRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const updated = await cancelRide({
    rideId: req.params.id,
    actorId: req.user._id,
    by: 'admin',
    reason: req.body.reason ?? 'Cancelled by admin',
  });
  sendSuccess(res, { ride: updated });
});

// ---------------------------------------------------------------------------
// Payments & wallets (admin)
// ---------------------------------------------------------------------------

export const adminListPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, method, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = {};
  if (status && status !== 'all') query.status = status;
  if (method && method !== 'all') query.method = method;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [payments, total] = await Promise.all([
    PaymentModel.find(query).populate('user', 'name phone').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    PaymentModel.countDocuments(query),
  ]);
  sendSuccess(res, { payments }, paginationMeta(p, l, total));
});

export const adminListWallets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [wallets, total] = await Promise.all([
    WalletModel.find().populate('user', 'name phone role').sort({ balance: -1 }).skip((p - 1) * l).limit(l).lean(),
    WalletModel.countDocuments(),
  ]);
  sendSuccess(res, { wallets }, paginationMeta(p, l, total));
});

export const adminWalletDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const wallet = await WalletModel.findOne({ user: req.params.id }).populate('user', 'name phone role');
  if (!wallet) throw NOT_FOUND('Wallet');
  const { transactions } = await listWalletTransactions(req.params.id, 1, 50);
  sendSuccess(res, { wallet, transactions });
});

export const adminListWalletTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { type, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const query: Record<string, unknown> = {};
  if (type && type !== 'all') query.type = type;
  const [transactions, total] = await Promise.all([
    WalletTransactionModel.find(query).populate('user', 'name phone role').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    WalletTransactionModel.countDocuments(query),
  ]);
  sendSuccess(res, { transactions }, paginationMeta(p, l, total));
});