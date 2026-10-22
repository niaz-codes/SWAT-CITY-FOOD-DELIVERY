import { z } from 'zod';

const mongoId = z.string().min(3, 'A valid id is required');

export const createRestaurantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  cuisine: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  status: z.enum(['closed', 'open', 'busy']).default('open'),
  featured: z.boolean().default(false),
  deliveryTimeMin: z.number().int().min(1).max(300).default(30),
  deliveryFee: z.number().min(0).default(0),
  minOrder: z.number().min(0).default(0),
  freeDelivery: z.boolean().default(false),
  promo: z.string().trim().max(120).optional(),
  emoji: z.string().max(4).optional(),
  gradient: z.array(z.string().max(20)).length(2).optional(),
  phone: z.string().trim().max(20).optional(),
  addressLine: z.string().trim().max(200).optional(),
  area: z.string().trim().max(60).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  hours: z
    .object({
      open: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      close: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    })
    .optional(),
});

export const updateRestaurantSchema = createRestaurantSchema.partial();

export const createFoodItemSchema = z.object({
  restaurantId: z.string().min(3),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  price: z.number().positive('Price must be greater than 0'),
  emoji: z.string().max(4).optional(),
  gradient: z.array(z.string().max(20)).length(2).optional(),
  calories: z.number().int().min(0).optional(),
  prepMin: z.number().int().min(0).optional(),
  popular: z.boolean().default(false),
  available: z.boolean().default(true),
  isVeg: z.boolean().default(false),
});

export const updateFoodItemSchema = updateRestaurantSchema
  .omit({
    name: true,
    status: true,
    featured: true,
  })
  .extend({
    available: z.boolean().optional(),
    popular: z.boolean().optional(),
    price: z.number().positive().optional(),
  });

export const createFoodCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  emoji: z.string().max(4).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const idParamSchema = z.object({ id: mongoId });
