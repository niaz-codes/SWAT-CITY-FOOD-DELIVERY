import { defineModel } from '../db/model';
import { WalletModel } from './Wallet';
import { UserModel } from './User';

export const TX_TYPES = ['credit', 'debit', 'refund', 'earning', 'commission'] as const;
export type TxType = (typeof TX_TYPES)[number];

export interface WalletTransaction {
  _id: string;

  wallet: string;
  user: string;

  type: TxType;
  amount: number;
  balanceAfter: number;

  // Free-form reference (order id, ride id, ride number, promo code...)
  reference?: string | null;
  referenceModel?: string | null;
  description?: string | null;

  // Audit trail
  byUser?: string | null;
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletTransactionModel = defineModel<WalletTransaction>({
  table: 'wallet_transactions',
  columns: [
    'wallet',
    'user',
    'type',
    'amount',
    'balanceAfter',
    'reference',
    'referenceModel',
    'description',
    'byUser',
    'metadata',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    wallet: () => WalletModel,
    user: () => UserModel,
    byUser: () => UserModel,
  },
});
