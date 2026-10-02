import type { Request, Response } from 'express';
import { UserModel } from '../models';
import {
  buildAuthResult,
  loginWithPassword,
  publicUser,
  registerUser,
  requestOtp,
  upsertOtpUser,
  verifyOtp,
} from '../services/auth.service';
import { registerDeviceToken, removeDeviceToken } from '../services/notification.service';
import {
  requestPasswordReset,
  resetPassword,
  verifyResetToken,
} from '../services/passwordReset.service';
import { verifyRefreshToken } from '../utils/tokens';
import { sendCreated, sendSuccess } from '../utils/respond';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import type { AuthRequest } from '../middleware/auth';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  sendCreated(res, result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginWithPassword(req.body.phone, req.body.password);
  sendSuccess(res, result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const claims = verifyRefreshToken(req.body.refreshToken);
  const user = await UserModel.findById(claims.sub).select('-password').lean();
  if (!user) throw UNAUTHORIZED('Account no longer exists');
  const result = await buildAuthResult({ ...user, _id: user._id });
  sendSuccess(res, result);
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserModel.findById(req.user?._id)
    .select('-password')
    .lean();
  if (!user) throw UNAUTHORIZED('Account no longer exists');
  sendSuccess(res, publicUser(user as never));
});

export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Device token unregister (optional body)
  const token = (req.body as { deviceToken?: string })?.deviceToken;
  if (token && req.user) {
    await removeDeviceToken(req.user._id, token);
  }
  sendSuccess(res, { loggedOut: true });
});

export const requestOtpCtrl = asyncHandler(async (req: Request, res: Response) => {
  const { otp, debugOtp } = requestOtp(req.body.phone);
  void otp;
  sendSuccess(res, { sent: true, ttlSeconds: 300 }, { debugOtp });
});

export const verifyOtpCtrl = asyncHandler(async (req: Request, res: Response) => {
  const { otp, name, email } = req.body;
  verifyOtp(req.body.phone, otp);
  const result = await upsertOtpUser({ phone: req.body.phone, name, email });
  sendSuccess(res, result);
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const user = await UserModel.findById(req.user?._id).select('+password');
  if (!user) throw UNAUTHORIZED('Account no longer exists');
  const bcrypt = await import('bcryptjs');
  const ok = await bcrypt.compare(oldPassword, user.password ? String(user.password) : '');
  if (!ok) throw new AppError('Current password is incorrect', 422);
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  sendSuccess(res, { message: 'Password changed successfully' });
});

export const registerDeviceTokenCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  await registerDeviceToken(req.user._id, req.body.deviceToken);
  sendSuccess(res, { registered: true });
});

// ---------------------------------------------------------------------------
// Forgot / reset password (Brevo email)
// ---------------------------------------------------------------------------

/**
 * Always answers 200 with a generic message so the endpoint cannot be used to
 * discover which email addresses have accounts.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await requestPasswordReset({
    email: req.body.email,
    ip: req.ip ?? '',
  });
  // `emailed` is intentionally NOT forwarded. Returning it would let anyone
  // enumerate registered accounts from this endpoint, which defeats the point of
  // the generic message. The client only needs `message`.
  sendSuccess(res, { message: result.message });
});

/** Lets the reset screen show "expired / invalid" before the user submits. */
export const verifyResetTokenCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyResetToken(req.body.token);
  sendSuccess(res, result);
});

export const resetPasswordCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await resetPassword({
    token: req.body.token,
    newPassword: req.body.newPassword,
  });
  sendSuccess(res, result);
});