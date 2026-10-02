import { z } from 'zod';

export const reviewSchema = z.object({
  targetType: z.enum(['restaurant', 'food', 'rider', 'ride']),
  targetId: z.string().min(3),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  comment: z.string().trim().max(1000).optional(),
  // Verifying purchase helps enforce one-review-per-order rules
  orderId: z.string().min(3).optional(),
});

export const supportSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.string().trim().max(60).optional(),
});

export const supportReplySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});