import { defineModel } from '../db/model';

export const USER_ROLES = ['customer', 'rider', 'restaurant', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  _id: string;

  role: UserRole;
  status: UserStatus;

  name?: string | null;
  email?: string | null;
  phone?: string | null;

  /** Intentionally never returned by the API — password hash only. */
  password?: string | null;

  verified: boolean;
  isApproved: boolean;
  pendingApproval: boolean;

  /**
   * Referral program. `referralCode` is this user's own share code (unique,
   * assigned to customers at signup); `referredBy` records the customer whose
   * code was applied at THIS user's signup. Referral rewards are wallet credits
   * tied to the referee's first delivered food order.
   */
  referralCode?: string | null;
  referredBy?: string | null;

  avatarUrl?: string | null;
  deviceTokens: string[];

  lastLoginAt?: Date | null;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const UserModel = defineModel<User>({
  table: 'users',
  columns: [
    'role',
    'status',
    'name',
    'email',
    'phone',
    'password',
    'verified',
    'isApproved',
    'pendingApproval',
    'referralCode',
    'referredBy',
    'avatarUrl',
    'deviceTokens',
    'lastLoginAt',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  hidden: ['password'],
  arrayCols: ['deviceTokens'],
  refs: {
    referredBy: () => UserModel,
  },
});
