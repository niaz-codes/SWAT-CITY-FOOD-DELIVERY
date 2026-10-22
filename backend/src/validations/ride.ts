import { z } from 'zod';
import { RIDE_TYPES } from '../models';

export const requestRideSchema = z.object({
  type: z.enum(RIDE_TYPES),
  pickup: z.object({
    address: z.string().trim().min(3).max(200),
    area: z.string().trim().max(60).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  dropoff: z.object({
    address: z.string().trim().min(3).max(200),
    area: z.string().trim().max(60).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  paymentMethod: z.enum(['cash', 'wallet']).default('cash'),
});

export const cancelRideSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export const estimateRideSchema = z.object({
  type: z.enum(RIDE_TYPES),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),
});
