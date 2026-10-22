import { z } from 'zod';

export const cartItemSchema = z.object({
  foodItem: z.string().min(3, 'foodItem id is required'),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(200).optional(),
});

export const addToCartSchema = z.object({
  restaurantId: z.string().min(3, 'restaurantId is required'),
  items: z.array(cartItemSchema).min(1, 'At least one item is required').max(50),
});

export const updateCartItemSchema = z.object({
  foodItem: z.string().min(3),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(200).optional(),
});
