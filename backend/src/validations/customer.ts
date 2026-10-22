import { z } from 'zod';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const addressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  full: z.string().trim().min(5, 'Address is too short').max(200),
  area: z.string().trim().max(60).optional(),
  tag: z.enum(['home', 'work', 'other', 'frequent']).default('other'),
  lat,
  lng,
  isDefault: z.boolean().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  avatarUrl: z.string().url().optional(),
  email: z.string().trim().email().optional(),
});

export const createAddressSchema = addressSchema;
