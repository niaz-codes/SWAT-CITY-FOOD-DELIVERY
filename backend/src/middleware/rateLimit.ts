import { rateLimit } from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please wait before trying again.' },
});

/**
 * Password reset is deliberately stricter than login: an attacker can use it
 * to spam mailboxes or brute-force tokens.
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});

/**
 * Payment initiation / verification. Stricter than the 300/min global limit:
 * these endpoints create gateway charges and must not be spammed.
 */
export const paymentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment requests. Please slow down.' },
});

/**
 * Wallet mutations (top-up, transfer, withdrawal, cash-in). Money-moving
 * endpoints get their own tight bucket so one client cannot spam them even
 * while staying under the global API limit.
 */
export const walletMutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many wallet requests. Please slow down.' },
});
