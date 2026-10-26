import { z } from 'zod';
import { phoneRegex } from './common';
import { vehiclePlateSchema } from './rider';

/**
 * Shared password policy. Requires a letter and a digit so no flow - signup or
 * reset - can downgrade an account to something trivially guessable.
 */
export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['customer', 'rider']),
  password: passwordPolicy,
  // Rider-only onboarding snapshot
  vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car']).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
  vehiclePlate: z.string().trim().max(20).optional(),
  cnic: z.string().trim().max(25).optional(),
});

/**
 * Email + password sign-in (step 1). Separate from the (removed) phone path so
 * it stays independently rate limited and independently evolvable.
 */
export const emailLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(72),
});

/**
 * Step 2 of email login / registration: confirm the 6-digit code emailed to the
 * address the challenge was issued for. `challengeToken` is the short-lived
 * proof handed back by the login / register / forgot-password step.
 */
export const emailOtpVerifySchema = z.object({
  challengeToken: z.string().trim().min(20, 'Verification session is missing or expired').max(2048),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

/**
 * Re-send the 6-digit code for a half-finished flow. Only the challenge token is
 * required - the email + purpose are read out of it server-side.
 */
export const resendOtpSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Verification session is missing or expired').max(2048),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(72),
});

export const fcmTokenSchema = z.object({
  deviceToken: z.string().min(10, 'Invalid push device token'),
});

/**
 * Google sign-in for customers.
 *
 * Only the ID token is accepted from the client — never a name, email or photo.
 * Those are read from the verified token server-side, so a tampered request
 * body cannot register an account under someone else's address.
 */
export const googleLoginSchema = z.object({
  idToken: z.string().trim().min(20, 'Google sign-in token is missing').max(4096),
});

// --- Rider registration ----------------------------------------------------

const latitude = z.coerce
  .number({ invalid_type_error: 'Pick your location on the map' })
  .min(-90, 'Invalid latitude')
  .max(90, 'Invalid latitude');
const longitude = z.coerce
  .number({ invalid_type_error: 'Pick your location on the map' })
  .min(-180, 'Invalid longitude')
  .max(180, 'Invalid longitude');

/**
 * Rider onboarding. Everything the rider signs up with is mandatory except the
 * email, which is optional but validated when present.
 *
 * Fields arrive as strings because this request is `multipart/form-data` (the
 * photo travels with it), so the coordinates and year count are coerced.
 */
export const riderRegisterSchema = z.object({  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  email: z.string().trim().email('Enter a valid email address'),
  password: passwordPolicy,
  cnic: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{7}-?\d{1}$/, 'Enter a valid CNIC (xxxxx-xxxxxxx-x)'),
  baseCity: z.string().trim().max(60).optional(),
  vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car'], {
    errorMap: () => ({ message: 'Choose a vehicle type' }),
  }),
  // Mandatory bike / vehicle registration number. Reuse the same schema as the
  // rider profile endpoint so an invalid plate cannot slip in through signup.
  vehiclePlate: vehiclePlateSchema,
  experienceYears: z.coerce
    .number({ invalid_type_error: 'Years of experience is required' })
    .int('Enter a whole number of years')
    .min(0, 'Experience cannot be negative')
    .max(60, 'Enter a realistic number of years'),
  latitude,
  longitude,
  locationLabel: z.string().trim().max(120).optional(),
});

export type RiderRegisterInput = z.infer<typeof riderRegisterSchema>;

// --- Restaurant owner registration -----------------------------------------

const latitudeNumber = z.coerce
  .number({ invalid_type_error: 'Pick your location on the map' })
  .min(-90, 'Invalid latitude')
  .max(90, 'Invalid latitude');
const longitudeNumber = z.coerce
  .number({ invalid_type_error: 'Pick your location on the map' })
  .min(-180, 'Invalid longitude')
  .max(180, 'Invalid longitude');

/**
 * Restaurant owner self-registration. Creates the owner account AND the
 * restaurant record in one step; the restaurant stays unapproved until an
 * admin approves it in the admin panel.
 */
export const restaurantRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  email: z.string().trim().email('Enter a valid email address'),
  password: passwordPolicy,
  restaurantName: z.string().trim().min(2, 'Restaurant name is required').max(80),
  cuisine: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  emoji: z.string().max(4).optional(),
  phoneRestaurant: z.string().trim().max(20).optional(),
  addressLine: z.string().trim().max(200).optional(),
  area: z.string().trim().max(60).optional(),
  latitude: latitudeNumber.optional(),
  longitude: longitudeNumber.optional(),
});

export type RestaurantRegisterInput = z.infer<typeof restaurantRegisterSchema>;

// --- Password reset --------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Verification session is missing or expired').max(2048),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordPolicy,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
