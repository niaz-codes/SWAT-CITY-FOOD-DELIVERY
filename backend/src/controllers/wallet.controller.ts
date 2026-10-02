import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import { listWalletTransactions, getOrCreateWallet } from '../services/wallet.service';
import { getSetting } from '../services/settings.service';

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
 * Top-up a wallet. The real gateway is a plug point here; this endpoint
 * simulates a successful deposit so the full wallet UX is testable end-to-end.
 * Replace createTopup with a call into your payment gateway to go live.
 */
export const topupWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== 'number' || amount <= 0 || amount > 100000) {
    throw new AppError('Amount must be between Rs 1 and Rs 100,000', 422);
  }
  const { creditWallet } = await import('../services/wallet.service');
  const { transaction } = await creditWallet(req.user._id, amount, 'credit', {
    reference: 'topup',
    description: 'Wallet top-up via online payment',
    byUser: req.user._id,
  });
  sendSuccess(res, { transaction, gatewayRef: `GW_${String(transaction._id)}` });
});

/** Rider cash-out: moves earnings balance out via a withdrawal record. */
export const withdrawEarnings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { debitWallet } = await import('../services/wallet.service');
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== 'number' || amount <= 0) {
    throw new AppError('Amount must be greater than 0', 422);
  }
  const { wallet } = await debitWallet(req.user._id, amount, 'debit', {
    reference: 'withdraw',
    description: 'Earnings withdrawal',
    byUser: req.user._id,
  });
  sendSuccess(res, { wallet });
});

export const payoutConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const minWithdraw = await getSetting<number>('min_withdrawal') ?? 500;
  const currency = await getSetting<string>('currency') ?? 'PKR';
  sendSuccess(res, { minWithdraw, currency });
});