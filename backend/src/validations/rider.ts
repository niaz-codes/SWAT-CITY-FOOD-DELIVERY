import { z } from 'zod';

/**
 * Bike / vehicle registration number.
 *
 * Pakistani plates are 1-4 letters, optional hyphen/space, then 1-4 digits
 * ("SWAT-1234", "ABC 12"). Kept permissive on purpose: admin confirms the real
 * number before approving a rider, so this rejects obvious typos rather than
 * trying to be a complete plate registry.
 */
export const vehiclePlateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,4}[\s-]?\d{1,4}$/, 'Enter a valid bike number (e.g. SWAT-1234)');

/**
 * Fields the rider may change on their own profile.
 *
 * Deliberately absent:
 *   - `avatarUrl`  admin approves the profile photo, the rider cannot set it
 *   - `cnic`       sensitive identity field, set at registration / by admin
 *   - `status`, `isOnline`, `approvalStatus`, `rejectionReason`, `lastLocation`
 *                  all owned by the backend or admin-only endpoints
 */
export const updateRiderProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car']).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
  vehiclePlate: vehiclePlateSchema.optional(),
});

export const riderLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
});

/**
 * Vehicle change proposed by a rider. Mirrors the vehicle chips in the app,
 * with the same plate grammar used at registration. All fields optional: the
 * rider may change just the plate, or switch Bike → Rickshaw, etc.
 */
export const updateVehicleSchema = z
  .object({
    vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car']).optional(),
    vehicleBrand: z.string().trim().max(60).optional(),
    vehiclePlate: vehiclePlateSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to change',
  });

/**
 * Base location saved from the rider's map. `label` is the human-readable
 * place name the search result carried, when the rider picked one.
 */
export const setBaseLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().max(120).optional(),
});

export const acceptDeliverySchema = z.object({  orderId: z.string().min(3),
});

/**
 * Rider toggles online/offline. Only approved riders may come online.
 */
export const onlineStatusSchema = z.object({
  online: z.boolean({ required_error: 'Specify online true or false' }),
});

export const acceptRideSchema = z.object({
  rideId: z.string().min(3),
});

export const completeDeliveryStatusSchema = z.object({
  orderId: z.string().min(3),
  status: z.enum(['picked_up', 'on_the_way', 'delivered']),
  deliveryNote: z.string().trim().max(200).optional(),
});
