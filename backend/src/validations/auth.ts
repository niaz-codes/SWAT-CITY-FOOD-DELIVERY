import { z } from 'zod';

const phoneRegex = /^(\+?92|0)?3[0-9]{9}$/;
const otpRegex = /^\d{4,6}$/;

export const phoneSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  email: z.string().trim().email('Enter a valid email address').optional(),
  role: z.enum(['customer', 'rider']),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  // Rider-only onboarding snapshot
  vehicleType: z.enum(['bike', 'rickshaw', 'van', 'car']).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
  vehiclePlate: z.string().trim().max(20).optional(),
  cnic: z.string().trim().max(25).optional(),
});

export const loginSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  password: z.string().min(1, 'Password is required'),
});

export const requestOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani mobile number (03xxxxxxxxx)'),
  otp: z.string().regex(otpRegex, 'OTP must be 4 to 6 digits'),
  name: z.string().trim().min(2).max(60).optional(),
  email: z.string().trim().email().optional(),
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

// --- Password reset --------------------------------------------------------

/**
 * Shared password policy. Requires a letter and a digit so a reset can never
 * downgrade an account to something trivially guessable.
 */
export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetTokenSchema = z.object({
  token: z.string().trim().min(20, 'Reset token is missing or malformed').max(256),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'Reset token is missing or malformed').max(256),
  newPassword: passwordPolicy,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;