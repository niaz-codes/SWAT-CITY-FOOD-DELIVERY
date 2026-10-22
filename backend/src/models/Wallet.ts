import { defineModel } from '../db/model';
import { UserModel } from './User';

// One Wallet per user (customer for spending, rider for earnings).
// balance must NEVER be mutated without a matching WalletTransaction.

export interface Wallet {
  _id: string;

  user: string;
  balance: number;
  holdsEarnings: boolean;
  lastTransactionAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletModel = defineModel<Wallet>({
  table: 'wallets',
  columns: ['user', 'balance', 'holdsEarnings', 'lastTransactionAt', 'createdAt', 'updatedAt'],
  refs: {
    user: () => UserModel,
  },
});
