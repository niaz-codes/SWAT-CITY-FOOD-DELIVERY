import type { Request, Response } from 'express';
import { UserModel } from '../models';
import {
  beginEmailLogin,
  buildAuthResult,
  loginOrRegisterGoogleCustomer,
  publicUser,
  registerRestaurantOwner,
  registerRiderWithPhoto,
  registerUser,
  resendEmailOtp,
  verifyEmailOtp,
} from '../services/auth.service';
import { verifyGoogleIdToken } from '../services/google-auth.service';
import { deleteFromCloudinary, uploadToCloudinary } from '../services/cloudinary.service';
import { registerDeviceToken, removeDeviceToken } from '../services/notification.service';
import { requestPasswordReset, resetPassword } from '../services/passwordReset.service';
import { verifyRefreshToken } from '../utils/tokens';
import { sendCreated, sendSuccess } from '../utils/respond';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import type { AuthRequest } from '../middleware/auth';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  sendCreated(res, result);
});

/** Restaurant owner sign-up: creates the owner account + the restaurant record. */
export const registerRestaurantCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerRestaurantOwner(req.body);
  sendCreated(res, result);
});

/** Email + password sign-in (step 1): validates credentials, emails a code. */
export const emailLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await beginEmailLogin(req.body.email, req.body.password);
  sendSuccess(res, result);
});

/** Email OTP (step 2): verifies the emailed code and returns a session. */
export const verifyEmailOtpCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyEmailOtp(req.body.challengeToken, req.body.otp);
  sendSuccess(res, result);
});

/** Re-issue the 6-digit code for a flow that has a valid challenge token. */
export const resendEmailOtpCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await resendEmailOtp(req.body.challengeToken);
  sendSuccess(res, result);
});

/**
 * Rider onboarding. Multipart because the self-taken photo travels with the
 * form, which keeps the account, the profile and the photo a single operation:
 * a rider can never end up with an account that has no photo on it.
 */
export const registerRider = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new AppError('A profile photo taken with the camera is required', 422);
  // A registration photo is an image, never a PDF - the document endpoint is
  // the one that accepts PDFs.
  if (!file.mimetype.startsWith('image/')) {
    throw new AppError('Profile photo must be an image', 415);
  }

  const uploaded = await uploadToCloudinary(file, 'swat-city/riders/applications');
  try {
    const result = await registerRiderWithPhoto(
      {
        name: req.body.name,
        phone: req.body.phone,
        email: req.body.email,
        password: req.body.password,
        cnic: req.body.cnic,
        baseCity: req.body.baseCity,
        vehicleType: req.body.vehicleType,
        vehiclePlate: req.body.vehiclePlate,
        experienceYears: req.body.experienceYears,
        location: {
          lat: req.body.latitude,
          lng: req.body.longitude,
          label: req.body.locationLabel,
        },
      },
      { url: uploaded.url, publicId: uploaded.publicId },
    );
    sendCreated(res, result);
  } catch (err) {
    // The account was never created, so the uploaded asset is an orphan.
    // Best-effort cleanup: a failure here must not mask the real error.
    void deleteFromCloudinary(uploaded.publicId).catch(() => undefined);
    throw err;
  }
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const claims = verifyRefreshToken(req.body.refreshToken);
  const user = await UserModel.findById(claims.sub).select('-password').lean();
  if (!user) throw UNAUTHORIZED('Account no longer exists');
  // A refresh must not resurrect a session the auth middleware would reject:
  // suspension and email-verification are re-checked at every token mint, so a
  // suspended account cannot keep trading access tokens for the whole
  // refresh-token lifetime.
  if (user.status === 'suspended') throw new AppError('Account is suspended', 403);
  if (!user.verified) throw new AppError('Please verify your email address to continue', 403);
  const result = await buildAuthResult({ ...user, _id: user._id });
  sendSuccess(res, result);
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const uid = req.user?._id;
  if (!uid) throw UNAUTHORIZED();
  const user = await UserModel.findById(uid).select('-password').lean();
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

/**
 * Customer sign-in / sign-up with Google.
 *
 * The client sends only a Google ID token. It is verified against Google here,
 * and the profile is taken from the verified token rather than the request
 * body. Google has already verified the email, so an existing customer gets a
 * session immediately and a new email is registered on the spot (no phone step).
 */
export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const identity = await verifyGoogleIdToken(req.body.idToken);
  const outcome = await loginOrRegisterGoogleCustomer(identity);
  sendSuccess(res, outcome.result, { created: outcome.created });
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const uid = req.user?._id;
  if (!uid) throw UNAUTHORIZED();
  const user = await UserModel.findById(uid).select('+password');
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
// Forgot / reset password (Supabase Auth OTP email)
// ---------------------------------------------------------------------------

/**
 * Always answers 200 with a generic message so the endpoint cannot be used to
 * discover which email addresses have accounts. The response also carries an
 * email-OTP challenge the client uses for the reset step.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await requestPasswordReset({
    email: req.body.email,
    ip: req.ip ?? '',
  });
  // The challenge is returned so the client can move to the code screen, but
  // `message` stays generic: it never reveals whether the account exists.
  sendSuccess(res, result);
});

export const resetPasswordCtrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await resetPassword({
    challengeToken: req.body.challengeToken,
    otp: req.body.otp,
    newPassword: req.body.newPassword,
  });
  sendSuccess(res, result);
});
