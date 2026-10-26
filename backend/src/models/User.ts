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
    'avatarUrl',
    'deviceTokens',
    'lastLoginAt',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  hidden: ['password'],
  arrayCols: ['deviceTokens'],
});
