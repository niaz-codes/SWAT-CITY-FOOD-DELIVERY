import { z } from 'zod';

export const updateRiderProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  cnic: z.string().trim().max(25).optional(),
  vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car']).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
  vehiclePlate: z.string().trim().max(20).optional(),
  avatarUrl: z.string().url().optional(),
});

export const riderLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
});

export const acceptDeliverySchema = z.object({
  orderId: z.string().min(3),
});

export const acceptRideSchema = z.object({
  rideId: z.string().min(3),
});

export const completeDeliveryStatusSchema = z.object({
  orderId: z.string().min(3),
  status: z.enum(['picked_up', 'on_the_way', 'delivered']),
  deliveryNote: z.string().trim().max(200).optional(),
});