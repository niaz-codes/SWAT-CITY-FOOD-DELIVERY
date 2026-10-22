import { randomUUID } from 'crypto';
import { env } from '../config/env';
import type { Doc } from '../db/model';
import { PaymentModel, WalletTransactionModel, type Payment } from '../models';
import { getProvider } from './payments';
import { verifyOnlinePayment, generateTransactionRef } from './payment.service';
import { creditWallet } from './wallet.service';
import type { GatewayInitiateResult } from './payments/types';
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from '../utils/AppError';

type PaymentDoc = Doc<Payment>;

export interface CreateWalletTopupInput {
  userId: string;
  amount: number;
  customerPhone?: string;
  customerEmail?: string;
  /** Stable key so a double-tap/retry reuses the same payment attempt. */
  idempotencyKey?: string;
}

/**
 * Start a wallet top-up through Easypaisa MA.
 *
 * Requirements:
 *  - The wallet is credited ONLY after the gateway verifies the debit (see
 *    `verifyWalletTopup`). Nothing mints balance from this path.
 *  - Exactly one Payment row per attempt; the unique `idempotencyKey` index plus
 *    the `topup_<transactionRef>` credit reference below guarantee the money is
 *    credited exactly once even across retries/race.
 *  - When the provider isn't configured the call returns `configured: false`
 *    with the reason — it never fabricates success.
 */
export async function createWalletTopup(input: CreateWalletTopupInput): Promise<{
  configured: boolean;
  payment?: PaymentDoc | null;
  handoff?: GatewayInitiateResult;
  message?: string;
}> {
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw BAD_REQUEST('Top-up amount must be greater than 0');
  }

  const provider = getProvider('easypaisa');
  if (!provider.isConfigured()) {
    return { configured: false, message: provider.configurationHint(), payment: null };
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + env.PAYMENT_EXPIRY_MINUTES * 60_000);

  // Reuse an in-flight attempt when a stable key is supplied so a double tap can
  // never open two charges against the same user.
  let payment = input.idempotencyKey
    ? await PaymentModel.findOne({
        idempotencyKey: input.idempotencyKey,
        user: input.userId,
        kind: 'topup',
      })
    : null;

  if (payment && payment.status === 'paid') {
    // Already a confirmed top-up; surface it so the client can resume.
    await creditTopupIfNeeded(payment, input.userId);
    return {
      configured: true,
      payment,
      handoff: { ok: true, handoff: null, gatewayRef: payment.gatewayRef ?? undefined },
    };
  }
  if (payment && ['failed', 'cancelled'].includes(payment.status)) {
    throw CONFLICT('This top-up attempt already failed. Please try again.');
  }

  if (!payment) {
    payment = await PaymentModel.create({
      user: input.userId,
      kind: 'topup',
      method: 'easypaisa',
      status: 'pending',
      amount: input.amount,
      currency: 'PKR',
      idempotencyKey: input.idempotencyKey,
      gateway: 'easypaisa',
      transactionRef: generateTransactionRef('WALLET', 'easypaisa'),
      expiresAt: expiry,
    });
  }

  const initiateInput = {
    transactionRef: payment.transactionRef as string,
    amountPkr: payment.amount,
    orderNumber: `WALLET-${String(payment.transactionRef)}`,
    description: 'Swat City Food Delivery Wallet Top-up',
    returnUrl: '',
    customerPhone: input.customerPhone ?? '',
    customerEmail: input.customerEmail ?? '',
  };

  const handoff = await provider.initiate(initiateInput);

  if (handoff.ok) {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'processing',
          initiatedAt: payment.initiatedAt ?? now,
          gatewayRef: handoff.gatewayRef ?? payment.gatewayRef ?? null,
        },
      },
    );
  } else {
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'failed',
          failedAt: now,
          failureReason: handoff.reason,
          gatewayResponseCode: handoff.code ?? null,
        },
      },
    );
  }

  const persisted = (await PaymentModel.findById(payment._id)) as PaymentDoc | null;
  return {
    configured: true,
    payment: persisted ?? (payment as unknown as PaymentDoc),
    handoff,
  };
}

/**
 * Confirm a wallet top-up with the gateway and credit the wallet exactly once.
 *
 * Safe to call repeatedly (polling, retries, IPN): a paid top-up returns the
 * result immediately and only the first caller that actually credits writes the
 * wallet transaction.
 */
export async function verifyWalletTopup(input: {
  userId: string;
  paymentId?: string;
}): Promise<{ payment: PaymentDoc | null; result: { status: string; reason?: string } }> {
  const query: Record<string, unknown> = { user: input.userId, kind: 'topup' };
  const payment = input.paymentId
    ? await PaymentModel.findOne({ _id: input.paymentId, user: input.userId, kind: 'topup' })
    : await PaymentModel.findOne(query).sort({ createdAt: -1 });
  if (!payment) throw NOT_FOUND('Pending top-up');

  if (payment.status === 'paid') {
    await creditTopupIfNeeded(payment, input.userId);
    return {
      payment: payment as unknown as PaymentDoc,
      result: { status: 'paid', reason: `Top-up of PKR ${payment.amount} confirmed` },
    };
  }

  const { payment: settled, result } = await verifyOnlinePayment({
    transactionRef: payment.transactionRef as string,
    method: 'easypaisa',
  });

  if (result.status === 'paid') {
    await creditTopupIfNeeded(settled, input.userId);
  }

  return {
    payment: (settled as unknown as PaymentDoc) ?? (payment as unknown as PaymentDoc),
    result: {
      status: result.status,
      reason:
        result.status === 'paid'
          ? `Top-up of PKR ${payment.amount} confirmed`
          : (result as { reason?: string }).reason,
    },
  };
}

/** Latest top-up attempt for the wallet screen to render / poll. */
export async function getWalletTopupStatus(input: { userId: string }) {
  const payment = await PaymentModel.findOne({
    user: input.userId,
    kind: 'topup',
    status: { $nin: ['failed'] },
  })
    .sort({ createdAt: -1 })
    .limit(1);
  return payment ? (payment as unknown as PaymentDoc) : null;
}

/**
 * The exactly-once happy path: if the top-up is `paid` and the wallet has not
 * been credited for this transaction yet, credit it now. The partial unique
 * index on `(user, reference)` where `reference like 'topup_%'` is the
 * authoritative backstop against double credits racing each other.
 */
export async function creditTopupIfNeeded(payment: PaymentDoc, userId: string): Promise<boolean> {
  if (!payment || payment.status !== 'paid') return false;
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  const transactionRef = payment.transactionRef as string;
  const reference = `topup_${transactionRef}`;
  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
  if (metadata.creditedAt) return true;

  const existing = await WalletTransactionModel.findOne({ user: userId, reference });
  if (existing) {
    await markCredited(payment);
    return true;
  }

  try {
    await creditWallet(userId, amount, 'credit', {
      reference,
      referenceModel: 'Payment',
      description: 'Easypaisa wallet top-up',
      byUser: userId,
      metadata: { kind: 'topup', paymentId: payment._id, transactionRef },
    });
    await markCredited(payment);
    return true;
  } catch (error) {
    // A concurrent verify/IPN won the race and our credit hit the unique index.
    if ((error as { code?: string }).code === '23505') {
      await markCredited(payment);
      return true;
    }
    throw error;
  }
}

async function markCredited(payment: PaymentDoc): Promise<void> {
  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
  if (metadata.creditedAt) return;
  await PaymentModel.updateOne(
    { _id: payment._id },
    { $set: { metadata: { ...metadata, creditedAt: new Date() } } },
  );
}

export function topupIdempotencyKey(): string {
  return `topup-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export type { Payment };
