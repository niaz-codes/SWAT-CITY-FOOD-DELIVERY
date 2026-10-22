import { Router } from 'express';
import {
  changePassword,
  emailLogin,
  forgotPassword,
  googleLogin,
  logout,
  me,
  refresh,
  register,
  registerDeviceTokenCtrl,
  registerRider,
  resendEmailOtpCtrl,
  resetPasswordCtrl,
  verifyEmailOtpCtrl,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimit';
import { upload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  emailLoginSchema,
  emailOtpVerifySchema,
  fcmTokenSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  refreshTokenSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  riderRegisterSchema,
} from '../validations/auth';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), register);
router.post(
  '/register/rider',
  authRateLimiter,
  upload.single('photo'),
  validate(riderRegisterSchema),
  registerRider,
);
router.post('/login/email', authRateLimiter, validate(emailLoginSchema), emailLogin);
// Step 2 of every email login / registration: confirm the 6-digit code.
router.post(
  '/otp/email/verify',
  authRateLimiter,
  validate(emailOtpVerifySchema),
  verifyEmailOtpCtrl,
);
// Re-send the code for an already-started flow (login / register / reset).
router.post('/otp/email/resend', authRateLimiter, validate(resendOtpSchema), resendEmailOtpCtrl);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', requireAuth, logout);

// Customer-only Google sign-in / sign-up. The ID token is verified server-side;
// a brand new email is registered immediately (Google already verified it).
router.post('/google', authRateLimiter, validate(googleLoginSchema), googleLogin);

// Forgot / reset password — public, but strictly rate limited. OTP only.
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validate(forgotPasswordSchema),
  forgotPassword,
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
