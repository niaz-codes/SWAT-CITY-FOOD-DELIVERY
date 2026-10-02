import type { FilterQuery, Types } from 'mongoose';
import { WalletModel, WalletTransactionModel, type TxType } from '../models';
import { AppError } from '../utils/AppError';

export type TxKind = TxType;

interface TxInput {
  reference?: string;
  referenceModel?: string;
  description?: string;
  byUser?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get-or-create a wallet for a user. Customer wallets hold spendable balance,
 * rider wallets hold earnings. Both use the same ledger with the SAME rule:
 * every mutation writes a WalletTransaction.
 */
export async function getOrCreateWallet(userId: string, holdsEarnings = false) {
  let wallet = await WalletModel.findOne({ user: userId });
  if (!wallet) {
    wallet = await WalletModel.create({ user: userId, holdsEarnings, balance: 0 });
  } else if (wallet.holdsEarnings !== holdsEarnings) {
    wallet.holdsEarnings = holdsEarnings;
    await wallet.save();
  }
  return wallet;
}

/**
 * Credit money to a wallet. Always creates a WalletTransaction with the
 * exact balanceAfter value for a perfect audit trail.
 */
export async function creditWallet(
  userId: string,
  amount: number,
  type: TxKind,
  input: TxInput = {},
) {
  if (amount <= 0) throw new AppError('Amount must be greater than 0', 422);
  const wallet = await getOrCreateWallet(userId);
  const updated = await WalletModel.findOneAndUpdate(
    { _id: wallet._id },
    { $inc: { balance: amount }, lastTransactionAt: new Date() },
    { new: true },
  );
  if (!updated) throw new AppError('Wallet update failed', 500);
  const tx = await WalletTransactionModel.create({
    wallet: updated._id,
    user: userId,
    type,
    amount,
    balanceAfter: updated.balance,
    reference: input.reference,
    referenceModel: input.referenceModel,
    description: input.description ?? 'Wallet credit',
    byUser: input.byUser,
    metadata: input.metadata,
  });
  return { wallet: updated, transaction: tx };
}

/**
 * Debit money from a wallet. Customer wallets cannot go negative; rider
 * earning wallets are allowed to be debited only for payouts (checked by caller).
 */
export async function debitWallet(
  userId: string,
  amount: number,
  type: TxKind,
  input: TxInput = {},
) {
  if (amount <= 0) throw new AppError('Amount must be greater than 0', 422);
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < amount) {
    throw new AppError('Insufficient wallet balance', 402);
  }
  const updated = await WalletModel.findOneAndUpdate(
    { _id: wallet._id, balance: { $gte: amount } },
    { $inc: { balance: -amount }, lastTransactionAt: new Date() },
    { new: true },
  );
  if (!updated) throw new AppError('Insufficient wallet balance', 402);
  const tx = await WalletTransactionModel.create({
    wallet: updated._id,
    user: userId,
    type,
    amount,
    balanceAfter: updated.balance,
    reference: input.reference,
    referenceModel: input.referenceModel,
    description: input.description ?? 'Wallet debit',
    byUser: input.byUser,
    metadata: input.metadata,
  });
  return { wallet: updated, transaction: tx };
}

/** List a user's transactions, newest first (paginated). */
export async function listWalletTransactions(
  userId: string,
  page = 1,
  limit = 20,
  filter: { type?: TxType } = {},
) {
  const query: FilterQuery<{ user: Types.ObjectId }> = { user: userId };
  if (filter.type) (query as Record<string, unknown>).type = filter.type;
  const [transactions, total] = await Promise.all([
    WalletTransactionModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    WalletTransactionModel.countDocuments(query),
  ]);
  return { transactions, total };
}

export async function getWalletBalance(userId: string): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  return wallet.balance;
}