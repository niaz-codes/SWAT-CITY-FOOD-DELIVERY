import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  WalletModel,
  WalletTransactionModel,
  WithdrawalModel,
  type Withdrawal,
  type WithdrawalStatus,
} from '../models';
import {
  creditWallet,
  debitWallet,
  getOrCreateWallet,
  listWalletTransactions,
} from './wallet.service';
import { getSetting } from './settings.service';
import { AppError, CONFLICT, NOT_FOUND } from '../utils/AppError';

const MSISDN_RE = /^(\+?92|0)?3\d{9}$/;

function makeReference(): string {
  return `WD-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

/** Stable reference for the refund tx that releases a reservation. */
function releaseReference(withdrawalRef: string): string {
  return `wd_release_${withdrawalRef}`;
}

export interface RequestWithdrawalInput {
  riderId: string;
  amount: number;
  destinationType: 'easypaisa' | 'bank';
  destination: string;
  destinationHolder: string;
  note?: string;
}

/**
 * Rider cash-out: reserves the requested amount and creates one withdrawal
 * request.
 *
 * Invariants:
 *  - The reservation is an atomic balance check + `debit` wallet transaction
 *    (`debitWallet`). Only after it succeeds is the Withdrawal row created; if
 *    creating that row fails the reservation is immediately reversed, so money
 *    can never be reserved without an accompanying request.
 *  - Nothing is paid out here. The money leaves the available balance and comes
 *    back only on `rejected`/`cancelled` (a `refund` release). `paid` means an
 *    admin recorded a real external payout against the already-reserved funds.
 *  - Riders can only withdraw to their own destination; the resolver does not
 *    care who the recipient is — it is always this rider's payment detail.
 */
export async function requestWithdrawal(input: RequestWithdrawalInput): Promise<{
  withdrawal: Withdrawal;
  wallet: NonNullable<Awaited<ReturnType<typeof getOrCreateWallet>>>;
  reserveTx: NonNullable<Awaited<ReturnType<typeof debitWallet>>['transaction']>;
}> {
  const { riderId, destinationType, destination, destinationHolder } = input;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new AppError('Amount must be greater than 0', 422);

  const minWithdraw = (await getSetting<number>('min_withdrawal')) ?? 500;
  if (amount < minWithdraw) {
    throw new AppError(`Minimum withdrawal is PKR ${minWithdraw}`, 422);
  }

  let normalizedDestination: string;
  if (destinationType === 'easypaisa') {
    normalizedDestination = String(destination).replace(/[^0-9]/g, '');
    if (!MSISDN_RE.test(`0${normalizedDestination.replace(/^92/, '').replace(/^0/, '')}`)) {
      throw new AppError('Enter a valid Easypaisa number (03xxxxxxxxx)', 422);
    }
    normalizedDestination = `0${normalizedDestination.replace(/^92/, '').replace(/^0/, '')}`;
  } else if (destinationType === 'bank') {
    normalizedDestination = String(destination).trim();
    if (normalizedDestination.length < 4 || normalizedDestination.length > 30) {
      throw new AppError('Enter a valid bank account number (4-30 characters)', 422);
    }
  } else {
    throw new AppError('destinationType must be "easypaisa" or "bank"', 422);
  }

  if (!destinationHolder || !String(destinationHolder).trim()) {
    throw new AppError('Account holder name is required', 422);
  }

  const wallet = await getOrCreateWallet(riderId, true);
  if (Number(wallet.balance) < amount) throw new AppError('Insufficient wallet balance', 402);

  const reference = makeReference();
  const { wallet: after, transaction: reserveTx } = await debitWallet(riderId, amount, 'debit', {
    reference: `withdraw_${reference}`,
    referenceModel: 'Withdrawal',
    description: `Withdrawal ${reference} reserved`,
    byUser: riderId,
    metadata: { withdrawalRef: reference },
  });

  // Wallet snapshot BEFORE the reservation, for admin context.
  const availableBalance = Math.round((Number(after.balance) + amount) * 100) / 100;

  try {
    const withdrawal = await WithdrawalModel.create({
      rider: riderId,
      reference,
      amount,
      availableBalance,
      destinationType,
      destination: normalizedDestination,
      destinationHolder: String(destinationHolder).trim(),
      status: 'pending',
      reserveTx: reserveTx._id,
      releaseTx: null,
      payoutReference: null,
      rejectReason: null,
      note: input.note?.trim() || null,
      metadata: {
        audit: [
          {
            status: 'pending',
            at: new Date().toISOString(),
            byUser: riderId,
            note: 'Withdrawal requested',
          },
        ],
      },
    });
    return { withdrawal: withdrawal as unknown as Withdrawal, wallet: after, reserveTx };
  } catch (error) {
    // The reservation already applied; reverse it so the rider's money is not
    // stuck to a request that was never created.
    await creditWallet(riderId, amount, 'refund', {
      reference: `withdraw_${reference}_reversal`,
      description: `Reversed failed withdrawal request ${reference}`,
      byUser: riderId,
      metadata: { withdrawalRef: reference },
    }).catch(() => undefined);
    throw error;
  }
}

export async function listRiderWithdrawals(riderId: string) {
  const withdrawals = await WithdrawalModel.find({ rider: riderId }).sort({ createdAt: -1 }).lean();
  let pendingAmount = 0;
  let totalWithdrawn = 0;
  for (const w of withdrawals) {
    if (w.status === 'paid') totalWithdrawn += Number(w.amount);
    else if (w.status !== 'rejected' && w.status !== 'cancelled') pendingAmount += Number(w.amount);
  }
  return { withdrawals, pendingAmount, totalWithdrawn };
}

/** Rider-initiated cancel. Only their own pending request; money is released. */
export async function cancelRiderWithdrawal(riderId: string, withdrawalId: string) {
  const record = await WithdrawalModel.findOne({ _id: withdrawalId, rider: riderId });
  if (!record) throw NOT_FOUND('Withdrawal');
  const updated = await transitionWithdrawal(
    record,
    ['pending'],
    'cancelled',
    riderId,
    'Cancelled by rider',
  );
  await ensureReleased(updated, riderId);
  return updated;
}

export async function approveWithdrawal(withdrawalId: string, actorId: string) {
  const record = await WithdrawalModel.findById(withdrawalId);
  if (!record) throw NOT_FOUND('Withdrawal');
  return transitionWithdrawal(record, ['pending'], 'approved', actorId, 'Approved by admin');
}

export async function processWithdrawal(withdrawalId: string, actorId: string) {
  const record = await WithdrawalModel.findById(withdrawalId);
  if (!record) throw NOT_FOUND('Withdrawal');
  return transitionWithdrawal(record, ['approved'], 'processing', actorId, 'Processing by admin');
}

export async function rejectWithdrawal(withdrawalId: string, actorId: string, reason: string) {
  const record = await WithdrawalModel.findById(withdrawalId);
  if (!record) throw NOT_FOUND('Withdrawal');
  const updated = await transitionWithdrawal(
    record,
    ['pending', 'processing'],
    'rejected',
    actorId,
    `Rejected by admin${reason ? `: ${reason}` : ''}`,
    { rejectReason: reason },
  );
  await ensureReleased(updated, actorId);
  return updated;
}

/**
 * Marks a withdrawal as actually paid. Money was reserved at request time, so
 * no wallet mutation happens here — an admin records an external payout
 * reference (`payoutReference`) proving the real transfer completed.
 */
export async function markWithdrawalPaid(
  withdrawalId: string,
  actorId: string,
  payoutReference: string,
) {
  const record = await WithdrawalModel.findById(withdrawalId);
  if (!record) throw NOT_FOUND('Withdrawal');
  return transitionWithdrawal(record, ['processing'], 'paid', actorId, 'Marked paid by admin', {
    payoutReference,
  });
}

export async function listWithdrawals(input: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { status, search } = input;
  const query: Record<string, unknown> = {};
  if (status && status !== 'all') query.status = status;

  let rows = await WithdrawalModel.find(query)
    .populate('rider', 'name phone')
    .sort({ createdAt: -1 })
    .lean();

  if (search) {
    const q = String(search).trim().toLowerCase();
    if (q) {
      rows = rows.filter((w: any) => {
        const rider = (w as any).rider ?? {};
        const riderName = String(rider.name ?? '').toLowerCase();
        const riderPhone = String(rider.phone ?? '').replace(/\D/g, '');
        return (
          String(w.reference).toLowerCase().includes(q) ||
          riderName.includes(q) ||
          riderPhone.includes(q) ||
          String(Math.round(Number(w.amount) * 100) / 100).includes(q)
        );
      });
    }
  }

  const total = rows.length;
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const pages = Math.ceil(total / limit) || 1;
  const withdrawals = rows.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { withdrawals, total, page, limit, pages };
}

export async function withdrawalDetail(withdrawalId: string) {
  const withdrawal = await WithdrawalModel.findById(withdrawalId).populate(
    'rider',
    'name phone email',
  );
  if (!withdrawal) throw NOT_FOUND('Withdrawal');
  const riderId = String((withdrawal as any).rider?._id ?? withdrawal.rider);
  const wallet = await getOrCreateWallet(riderId, false);
  const { transactions } = await listWalletTransactions(riderId, 1, 30);
  return { withdrawal, wallet, transactions: transactions ?? [] };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Atomic status transition guarded by the CURRENT status at the database level,
 * so two concurrent admins/actions can never double-advance or double-settle a
 * request. Returns the fresh row (via the model) or throws CONFLICT.
 */
async function transitionWithdrawal(
  record: Withdrawal,
  fromStatuses: WithdrawalStatus[],
  to: WithdrawalStatus,
  actorId: string,
  note: string,
  extra: Record<string, unknown> = {},
): Promise<Withdrawal> {
  if (!fromStatuses.includes(record.status)) {
    throw CONFLICT(`Withdrawal has already moved to ${record.status}`);
  }

  const audit = Array.isArray((record.metadata ?? {}).audit) ? (record.metadata as any).audit : [];
  const metadata = {
    ...(record.metadata ?? {}),
    audit: [
      ...audit,
      { status: to, at: new Date().toISOString(), byUser: actorId, note: note ?? null },
    ],
  };

  const { data, error } = await supabaseAdmin
    .from('withdrawals')
    .update({ status: to, metadata, updatedAt: new Date().toISOString(), ...extra })
    .eq('_id', record._id)
    .in('status', fromStatuses)
    .select('_id');

  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data || data.length === 0)
    throw CONFLICT(`Withdrawal has already moved from ${fromStatuses.join('/')}`);

  const fresh = await WithdrawalModel.findById(record._id);
  if (!fresh) throw NOT_FOUND('Withdrawal');
  return fresh as unknown as Withdrawal;
}

/**
 * Return the reserved money to the rider wallet. Exactly-once: the partial
 * unique index on `wallet_transactions.reference` for `wd_release_%` references
 * plus the `releaseTx` guard make concurrent/nested releases a no-op.
 */
async function ensureReleased(record: Withdrawal, actorId: string): Promise<void> {
  if (record.releaseTx) return;

  const reference = releaseReference(record.reference);
  const existing = await WalletTransactionModel.findOne({ reference });
  if (existing) {
    await WithdrawalModel.updateOne({ _id: record._id }, { $set: { releaseTx: existing._id } });
    return;
  }

  const { transaction } = await creditWallet(String(record.rider), record.amount, 'refund', {
    reference,
    referenceModel: 'Withdrawal',
    description: `Withdrawal ${record.reference} released back to wallet`,
    byUser: actorId,
    metadata: { withdrawalRef: record.reference, withdrawalId: record._id },
  });
  await WithdrawalModel.updateOne({ _id: record._id }, { $set: { releaseTx: transaction._id } });
}

export { WalletModel };
