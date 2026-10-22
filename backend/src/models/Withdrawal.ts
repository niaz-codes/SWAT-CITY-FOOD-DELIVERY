import { defineModel, type ModelApi } from '../db/model';
import { UserModel } from './User';

/**
 * A rider's payout request against their earnings wallet.
 *
 * Money movement rule: the requested amount is reserved the moment a request is
 * created (a wallet `debit` row) and stays out of the available balance until
 * one of two terminal states — `paid` (the money actually left to the rider) or
 * `rejected`/`cancelled` (the reservation is released back with a `refund` row).
 * `paid` jumps straight to terminal: the money was already set aside, so no
 * second wallet mutation happens at payout time.
 */
export const WITHDRAWAL_STATUSES = [
  'pending',
  'approved',
  'processing',
  'paid',
  'rejected',
  'cancelled',
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Where the payout will be delivered. `bank` is a manual admin payout. */
export const WITHDRAWAL_DESTINATIONS = ['easypaisa', 'bank'] as const;
export type WithdrawalDestination = (typeof WITHDRAWAL_DESTINATIONS)[number];

export interface Withdrawal {
  _id: string;

  /** The rider (a User with role 'rider') who owns the wallet. */
  rider: string;

  /** Unique request reference shown to the rider and admin, e.g. WD-XXXX. */
  reference: string;

  amount: number;

  /** Wallet balance snapshot BEFORE the reservation, for admin context. */
  availableBalance: number;

  destinationType: WithdrawalDestination;
  /** 03xxxxxxxxx for easypaisa, or a bank account number for manual payout. */
  destination: string;
  destinationHolder: string;

  status: WithdrawalStatus;

  /** wallet_transactions id of the reservation debit. */
  reserveTx: string | null;
  /** wallet_transactions id of the release refund (rejected/cancelled). */
  releaseTx: string | null;

  /** Admin-recorded external payout reference — only after real transfer. */
  payoutReference: string | null;
  rejectReason: string | null;
  note: string | null;

  /** Audit trail (status changes + actor ids) plus optional free-form context. */
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}

export const WithdrawalModel: ModelApi<Withdrawal> = defineModel<Withdrawal>({
  table: 'withdrawals',
  columns: [
    'rider',
    'reference',
    'amount',
    'availableBalance',
    'destinationType',
    'destination',
    'destinationHolder',
    'status',
    'reserveTx',
    'releaseTx',
    'payoutReference',
    'rejectReason',
    'note',
    'metadata',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    rider: () => UserModel,
  },
});
