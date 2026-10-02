import { z } from 'zod';

export const promotionSchema = z.object({
  code: z.string().trim().min(3).max(20).toUpperCase(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  type: z.enum(['percent', 'flat']).default('percent'),
  value: z.number().min(0),
  maxDiscount: z.number().min(0).optional(),
  minOrder: z.number().min(0).default(0),
  audience: z
    .object({
      type: z.enum(['all', 'new_customers', 'specific_users', 'specific_riders']).default('all'),
      userIds: z.array(z.string()).max(1000).optional(),
    })
    .optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  maxUses: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
});

export const updatePromotionSchema = promotionSchema.partial();

export const supportStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().min(3).optional(),
});

export const riderReviewSchema = z.object({
  riderId: z.string().min(3),
  approvalStatus: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(300).optional(),
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const appSettingSchema = z.object({
  key: z.string().trim().min(2).max(80),
  value: z.unknown(),
  label: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
});

export const updateAppSettingSchema = appSettingSchema.partial().omit({ key: true });