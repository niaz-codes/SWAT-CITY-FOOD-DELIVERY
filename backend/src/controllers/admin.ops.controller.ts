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
import { recordAdminAction } from '../services/adminAudit.service';
import { advanceOrderStatus, cancelOrder, assignRiderToOrder } from '../services/order.service';
import { cancelRide } from '../services/ride.service';
import { listWalletTransactions } from '../services/wallet.service';
import {
  listManualPayments,
  manualPaymentDetail,
  reviewManualPayment,
  type ReviewDecision,
} from '../services/paymentReview.service';
import { receiptSignedUrl } from '../services/manualPayment.service';
import {
  listWithdrawals,
  withdrawalDetail,
  approveWithdrawal,
  processWithdrawal,
  rejectWithdrawal,
  markWithdrawalPaid,
} from '../services/withdrawal.service';

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
  // An order is accepted (pending → confirmed) only AFTER its payment is
  // verified. Cash pays on delivery and wallet pays at placement; every other
  // method (gateways + direct bank/wallet transfers) must already be `paid` —
  // a `pending_verification` payment can never unlock the kitchen.
  if (
    next === 'confirmed' &&
    order.paymentMethod !== 'cash' &&
    order.paymentMethod !== 'wallet' &&
    order.paymentStatus !== 'paid'
  ) {
    throw new AppError(
      'The payment has not been verified yet. Verify the transfer (or wait for the gateway) before accepting this order.',
      409,
    );
  }
  const updated = await advanceOrderStatus(req.params.id, next, req.user._id);
  sendSuccess(res, { order: updated });
});

export const adminCancelOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const reason = String(req.body.reason ?? '').trim() || 'Cancelled by admin';
  const updated = await cancelOrder({
    orderId: req.params.id,
    actorId: req.user._id,
    by: 'admin',
    reason,
  });
  // Money-adjacent admin action: an audit row regardless of whether a refund
  // leg actually ran (wallet auto-refund vs manual transfer vs unpaid cash).
  void recordAdminAction({
    adminId: String(req.user._id),
    action: 'order_cancel',
    targetType: 'order',
    targetId: String(updated._id),
    detail: `paymentStatus=${updated.paymentStatus} — ${reason}`,
  });
  sendSuccess(res, { order: updated });
});

export const adminAssignRider = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { riderId } = req.body as { riderId?: string };
  if (!riderId) throw new AppError('riderId is required', 422);
  const order = await assignRiderToOrder(req.params.id, riderId, { allowEarly: true });
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
    RideModel.find(query)
      .populate('customer', 'name phone')
      .populate('rider', 'name phone')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
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
    PaymentModel.find(query)
      .populate('user', 'name phone')
      .populate('order', 'orderNumber total paymentStatus')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    PaymentModel.countDocuments(query),
  ]);
  sendSuccess(res, { payments }, paginationMeta(p, l, total));
});

// ---------------------------------------------------------------------------
// Direct bank/wallet transfer verification (UBL + manual Easypaisa/JazzCash)
// Only an authorised admin reaches these — requireAdmin sits on the router.
// ---------------------------------------------------------------------------

/**
 * GET /admin/payments/verification — the transfer-verification queue.
 * Default shows every manual payment the admin can still act on
 * (pending_verification / pending / processing); `?status=` narrows it.
 */
export const adminListTransferPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const { rows, total } = await listManualPayments({
    status: status ? String(status) : undefined,
    page: p,
    limit: l,
  });
  sendSuccess(res, { payments: rows }, paginationMeta(p, l, total));
});

/**
 * GET /admin/payments/verification/:id — full review bundle: payment (with a
 * short-lived signed receipt URL), the order it belongs to, customer details,
 * and the append-only audit log for this payment.
 */
export const adminTransferPaymentDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const detail = await manualPaymentDetail(req.params.id);
  if (!detail) throw NOT_FOUND('Payment');
  sendSuccess(res, { verification: detail });
});

/**
 * POST /admin/payments/verification/:id/decision — the verification itself.
 * Body: { decision: approve | reject | request_info, reason? }.
 *
 * This is the ONLY place a manual-transfer payment may become `paid`. The
 * handler re-checks ownership of the flow server-side (decision rules, amount
 * match vs. the server-side order total, receipt presence for approvals) and
 * writes the admin id + timestamp + decision + reason to the audit log.
 */
export const adminTransferPaymentDecision = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { decision, reason } = req.body as { decision: ReviewDecision; reason?: string };
  const { payment, order } = await reviewManualPayment({
    paymentId: req.params.id,
    adminId: String(req.user._id),
    decision,
    reason,
  });
  sendSuccess(res, {
    payment: {
      id: payment._id,
      status: payment.status,
      method: payment.method,
      transactionRef: payment.transactionRef ?? null,
      verifyAttempts: payment.verifyAttempts,
    },
    order: {
      id: order._id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      status: order.status,
    },
  });
});

/**
 * GET /admin/payments/verification/:id/receipt — refresh a signed receipt URL
 * (the review drawer reuses the one in the detail bundle; this is for reloads).
 */
export const adminTransferReceiptUrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const payment = await PaymentModel.findById(req.params.id);
  if (!payment) throw NOT_FOUND('Payment');
  const url = await receiptSignedUrl(payment).catch(() => null);
  if (!url) throw NOT_FOUND('Receipt');
  sendSuccess(res, { url, expiresInMinutes: 30 });
});

export const adminListWallets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [wallets, total] = await Promise.all([
    WalletModel.find()
      .populate('user', 'name phone role')
      .sort({ balance: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    WalletModel.countDocuments(),
  ]);
  sendSuccess(res, { wallets }, paginationMeta(p, l, total));
});

export const adminWalletDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const wallet = await WalletModel.findOne({ user: req.params.id }).populate(
    'user',
    'name phone role',
  );
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
    WalletTransactionModel.find(query)
      .populate('user', 'name phone role')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    WalletTransactionModel.countDocuments(query),
  ]);
  sendSuccess(res, { transactions }, paginationMeta(p, l, total));
});

// ---------------------------------------------------------------------------
// Withdrawals (admin)
// ---------------------------------------------------------------------------

export const adminListWithdrawals = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, search, page = '1', limit = '20' } = req.query;
  const data = await listWithdrawals({
    status: status ? String(status) : undefined,
    search: search ? String(search) : undefined,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });
  sendSuccess(
    res,
    { withdrawals: data.withdrawals },
    paginationMeta(data.page, data.limit, data.total),
  );
});

export const adminWithdrawalDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const data = await withdrawalDetail(req.params.id);
  sendSuccess(res, data);
});

export const adminApproveWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const withdrawal = await approveWithdrawal(req.params.id, req.user._id);
  sendSuccess(res, { withdrawal });
});

export const adminProcessWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const withdrawal = await processWithdrawal(req.params.id, req.user._id);
  sendSuccess(res, { withdrawal });
});

export const adminRejectWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { reason } = req.body as { reason?: string };
  if (!reason || !String(reason).trim()) throw new AppError('A rejection reason is required', 422);
  const withdrawal = await rejectWithdrawal(req.params.id, req.user._id, String(reason).trim());
  sendSuccess(res, { withdrawal });
});

export const adminPayWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { payoutReference } = req.body as { payoutReference?: string };
  if (!payoutReference || !String(payoutReference).trim()) {
    throw new AppError('payoutReference is required (external transfer/txn id)', 422);
  }
  const withdrawal = await markWithdrawalPaid(
    req.params.id,
    req.user._id,
    String(payoutReference).trim(),
  );
  sendSuccess(res, { withdrawal });
});
