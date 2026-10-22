import { randomUUID } from 'crypto';
import type { Filter } from '../db/model';
import { WalletModel, WalletTransactionModel, type TxType } from '../models';
import { AppError } from '../utils/AppError';

type TxKind = TxType;

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
 *
 * `holdsEarnings` is only applied when explicitly provided, so routine
 * crediting of an existing rider wallet never flips its flag back to false.
 */
export async function getOrCreateWallet(userId: string, holdsEarnings?: boolean) {
  let wallet = await WalletModel.findOne({ user: userId });
  if (!wallet) {
    wallet = await WalletModel.create({
      user: userId,
      holdsEarnings: holdsEarnings ?? false,
      balance: 0,
    });
  } else if (holdsEarnings !== undefined && wallet.holdsEarnings !== holdsEarnings) {
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

/**
 * Move money between two wallets. The sender is debited first (authoritative
 * balance check), then the recipient credited. If the credit leg fails for any
 * reason the debit is reversed with its own refund transaction, so both
 * ledgers stay in balance and the audit trail explains the reversal. Both legs
 * share the same `reference` so they can be correlated.
 */
export async function transferWallet(
  fromUserId: string,
  toUserId: string,
  amount: number,
  input: TxInput & { inboundDescription?: string } = {},
) {
  if (fromUserId === toUserId) throw new AppError('Cannot transfer to yourself', 422);
  const reference = `xfer_${randomUUID()}`;
  const { wallet: debited, transaction: outTx } = await debitWallet(fromUserId, amount, 'debit', {
    reference,
    description: input.description ?? 'Wallet transfer sent',
    byUser: input.byUser,
    metadata: { direction: 'out', toUserId },
  });
  try {
    const { wallet: credited, transaction: inTx } = await creditWallet(toUserId, amount, 'credit', {
      reference,
      description: input.inboundDescription ?? 'Wallet transfer received',
      byUser: input.byUser,
      metadata: { direction: 'in', fromUserId },
    });
    return { debited, credited, outTx, inTx, reference };
  } catch (error) {
    await creditWallet(fromUserId, amount, 'refund', {
      reference: `${reference}_reversal`,
      description: 'Reversed failed transfer',
      byUser: input.byUser,
      metadata: { direction: 'in', reversed: true, reference },
    });
    throw error;
  }
}
export async function listWalletTransactions(
  userId: string,
  page = 1,
  limit = 20,
  filter: { type?: TxType } = {},
) {
  const query: Filter = { user: userId };
  if (filter.type) (query as Record<string, unknown>).type = filter.type;
  const [transactions, total] = await Promise.all([
    WalletTransactionModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    WalletTransactionModel.countDocuments(query),
  ]);
  return { transactions, total };
}
