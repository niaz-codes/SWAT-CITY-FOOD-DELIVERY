import { defineModel } from '../db/model';

/** Audience targeting embedded in the promotion (jsonb column). */
export interface PromotionAudience {
  type: string;
  userIds: string[];
}

export interface Promotion {
  _id: string;

  code: string;
  title: string;
  description?: string | null;

  type: string;
  value: number; // e.g. 15 (percent) or 150 (flat)
  maxDiscount?: number | null;
  minOrder: number;

  // audience targeting
  audience: PromotionAudience;

  startsAt: Date;
  expiresAt?: Date | null;
  maxUses?: number | null;
  usedCount: number;

  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const PromotionModel = defineModel<Promotion>({
  table: 'promotions',
  columns: [
    'code',
    'title',
    'description',
    'type',
    'value',
    'maxDiscount',
    'minOrder',
    'audience',
    'startsAt',
    'expiresAt',
    'maxUses',
    'usedCount',
    'active',
    'createdAt',
    'updatedAt',
  ],
});
