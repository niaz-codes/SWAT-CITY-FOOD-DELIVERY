import { Router } from 'express';
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  registerDeviceTokenCtrl,
  requestOtpCtrl,
  resetPasswordCtrl,
  verifyOtpCtrl,
  verifyResetTokenCtrl,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter, otpRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  fcmTokenSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  resetTokenSchema,
  verifyOtpSchema,
} from '../validations/auth';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), register);
router.post('/login', authRateLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', requireAuth, logout);

router.post('/otp/request', authRateLimiter, validate(requestOtpSchema), requestOtpCtrl);
router.post('/otp/verify', authRateLimiter, validate(verifyOtpSchema), verifyOtpCtrl);

// Forgot / reset password — public, but strictly rate limited.
router.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post(
  '/reset-password/verify',
  passwordResetRateLimiter,
  validate(resetTokenSchema),
  verifyResetTokenCtrl,
);
router.post(
  '/reset-password',
  passwordResetRateLimiter,
  validate(resetPasswordSchema),
  resetPasswordCtrl,
);

router.get('/me', requireAuth, me);
router.post('/change-password', requireAuth, validate(changePasswordSchema), changePassword);
router.post('/device-token', requireAuth, validate(fcmTokenSchema), registerDeviceTokenCtrl);

export default router;