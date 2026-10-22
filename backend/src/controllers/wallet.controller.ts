import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import {
  listWalletTransactions,
  getOrCreateWallet,
  transferWallet,
} from '../services/wallet.service';
import {
  createWalletTopup,
  verifyWalletTopup,
  getWalletTopupStatus,
  topupIdempotencyKey,
} from '../services/topup.service';
import {
  requestWithdrawal,
  listRiderWithdrawals,
  cancelRiderWithdrawal,
} from '../services/withdrawal.service';
import { getSetting } from '../services/settings.service';
import { UserModel, OrderModel, WalletTransactionModel } from '../models';
import { normalizePhone } from '../utils/helpers';

export const getWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const wallet = await getOrCreateWallet(req.user._id);
  sendSuccess(res, { wallet });
});

export const walletTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const { transactions, total } = await listWalletTransactions(req.user._id, page, limit);
  const wallet = await getOrCreateWallet(req.user._id);
  sendSuccess(res, { wallet, transactions }, { page, limit, total });
});

/**
 * Wallet top-up history.
 *
 * The old POST /wallet/topup minted balance without contacting a gateway: it
 * validated the amount, called creditWallet() and returned a fabricated
 * `gatewayRef`. Any client could therefore mint unlimited balance for free.
 * Top-ups now go through a real gateway debit like order payments do: a
 * `kind: 'topup'` Payment is created and initiated, then the wallet is credited
 * ONLY after verifyOnlinePayment() gets a gateway confirmation. Until merchant
 * credentials are configured the create returns `configured: false` and no
 * Payment is created (nothing to settle later).
 */

/**
 * Start a wallet top-up via Easypaisa MA. Mirrors order payments: this only
 * creates the Payment + gateway initiation. The wallet is credited later, and
 * only after the gateway itself confirms the debit (see `verifyTopup`).
 */
export const createTopup = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { amount, idempotencyKey, customerPhone } = req.body as {
    amount?: number;
    idempotencyKey?: string;
    customerPhone?: string;
  };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Top-up amount must be greater than 0', 422);
  }
  const result = await createWalletTopup({
    userId: req.user._id,
    amount,
    customerPhone: customerPhone?.trim() || undefined,
    idempotencyKey: idempotencyKey?.trim() || topupIdempotencyKey(),
  });
  sendSuccess(res, result);
});

/**
 * Ask the gateway for the truth and credit the wallet only when it confirms.
 * Safe to call repeatedly while the top-up is pending or after it is paid.
 */
export const verifyTopup = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { paymentId } = (req.body ?? {}) as { paymentId?: string };
  const result = await verifyWalletTopup({ userId: req.user._id, paymentId });
  sendSuccess(res, result);
});

/** Current state for the wallet screen: latest top-up attempt + wallet. */
export const topupStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const [payment, wallet] = await Promise.all([
    getWalletTopupStatus({ userId: req.user._id }),
    getOrCreateWallet(req.user._id),
  ]);
  sendSuccess(res, { payment, wallet });
});

/**
 * Rider cash-out request. Reserved immediately (a wallet `debit` row) and paid
 * out by an admin after approval; rejected/cancelled requests have the money
 * released back automatically. Same destination as order checkout expose.
 */
export const requestWithdrawalCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.user.role !== 'rider')
    throw new AppError('Withdrawals are only available to riders', 403);
  const { amount, destinationType, destination, destinationHolder, note } = req.body as {
    amount?: number;
    destinationType?: 'easypaisa' | 'bank';
    destination?: string;
    destinationHolder?: string;
    note?: string;
  };
  const result = await requestWithdrawal({
    riderId: req.user._id,
    amount: Number(amount),
    destinationType: destinationType as 'easypaisa' | 'bank',
    destination: String(destination ?? ''),
    destinationHolder: String(destinationHolder ?? ''),
    note: note || undefined,
  });
  sendSuccess(res, result);
});

/** Rider's own withdrawal requests + running pending/paid totals. */
export const riderWithdrawalsList = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.user.role !== 'rider')
    throw new AppError('Withdrawals are only available to riders', 403);
  const result = await listRiderWithdrawals(req.user._id);
  sendSuccess(res, result);
});

/** Rider cancels their own still-pending request; the reservation is released. */
export const riderCancelWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.user.role !== 'rider')
    throw new AppError('Withdrawals are only available to riders', 403);
  const updated = await cancelRiderWithdrawal(req.user._id, req.params.id);
  sendSuccess(res, { withdrawal: updated });
});

export const payoutConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const minWithdraw = (await getSetting<number>('min_withdrawal')) ?? 500;
  const currency = (await getSetting<string>('currency')) ?? 'PKR';
  sendSuccess(res, { minWithdraw, currency });
});

/**
 * Wallet-to-wallet transfer. The sender is any authenticated user; the
 * recipient is resolved by phone number and must be an active account. Money
 * only ever moves between real wallets, never from thin air — `transferWallet`
 * debits first and reverses if the credit leg fails.
 */
export const transferWalletCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { phone, amount, note } = req.body as { phone?: string; amount?: number; note?: string };
  if (typeof amount !== 'number' || amount <= 0) {
    throw new AppError('Amount must be greater than 0', 422);
  }
  const [sender, recipient] = await Promise.all([
    UserModel.findById(req.user._id).select('name phone').lean(),
    UserModel.findOne({ phone: normalizePhone(phone ?? ''), status: 'active' })
      .select('name phone')
      .lean(),
  ]);
  if (!recipient) throw new AppError('No active account found for that number', 404);
  if (String(recipient._id) === req.user._id) {
    throw new AppError('You cannot transfer to yourself', 422);
  }
  const recipientName = recipient.name ?? recipient.phone;
  const { debited, credited } = await transferWallet(req.user._id, String(recipient._id), amount, {
    byUser: req.user._id,
    description: note?.trim()
      ? `Transfer to ${recipientName}: ${note.trim()}`
      : `Transfer to ${recipientName}`,
    inboundDescription: `Transfer from ${sender?.name ?? req.user._id.slice(-6).toUpperCase()}`,
  });
  sendSuccess(res, {
    sent: { amount, to: recipientName },
    wallet: debited,
    recipientWallet: credited,
  });
});

/**
 * Rider cash deposit: a rider logs the cash they collected for COD deliveries
 * into their own earnings wallet.
 *
 * The requested amount is NOT trusted. The server recomputes the rider's
 * un-deposited COD collections — the totals of delivered cash orders minus
 * every prior cash-in credit in the wallet ledger — and rejects anything above
 * that ceiling. Without this the endpoint let any rider mint unlimited balance
 * (creditWallet from thin air, then spend or transfer it).
 */
export const riderCashIn = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (req.user.role !== 'rider')
    throw new AppError('Cash deposits are only available to riders', 403);
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Amount must be greater than 0', 422);
  }

  const riderId = req.user._id;
  const [collected, deposited] = await Promise.all([
    OrderModel.aggregate([
      { $match: { rider: riderId, paymentMethod: 'cash', status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    WalletTransactionModel.aggregate([
      { $match: { user: riderId, reference: 'cash_in' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const collectedTotal = Number(collected?.[0]?.total ?? 0);
  const depositedTotal = Number(deposited?.[0]?.total ?? 0);
  const cashable = Math.max(0, Math.round(collectedTotal - depositedTotal));

  if (cashable <= 0) {
    throw new AppError('No un-deposited COD cash is available to deposit', 422);
  }
  if (amount > cashable) {
    throw new AppError(`Amount exceeds your un-deposited COD cash (maximum Rs ${cashable})`, 422);
  }

  const { creditWallet } = await import('../services/wallet.service');
  const { wallet } = await creditWallet(riderId, amount, 'credit', {
    reference: 'cash_in',
    description: 'Cash deposited from deliveries',
    byUser: riderId,
  });
  sendSuccess(res, { wallet, cashableRemaining: cashable - amount });
});
