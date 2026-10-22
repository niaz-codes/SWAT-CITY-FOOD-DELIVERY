// ============================================================
// Swat City Backend - Password reset (forgot / verify / reset)
//
// Flow (email OTP only - no reset links)
//   1. POST /auth/forgot-password  { email }
//        -> always answers 200 with a generic message (no account enumeration)
//        -> emails a single-use, time-limited code via Supabase Auth
//        -> returns an OTP challenge the client uses for step 2
//   2. POST /auth/reset-password  { challengeToken, otp, newPassword }
//        -> verifies the code, sets the new password, burns the code
//
// The raw code exists only in the email and in the request body. It is never
// written to this server's database and never logged.
// ============================================================

import bcrypt from 'bcryptjs';
import { UserModel } from '../models';
import { sendPasswordChangedEmail } from './email.service';
import { AppError } from '../utils/AppError';
import { verifyEmailOtpChallenge } from '../utils/tokens';
import {
  issueEmailOtp,
  consumeEmailOtp,
  buildOtpChallenge,
  OTP_TTL_SECONDS,
  type OtpChallengeResponse,
} from './otp.service';

export const GENERIC_RESPONSE =
  'If an account exists for that email, a verification code has been sent.';

export interface ForgotPasswordResult extends OtpChallengeResponse {
  message: string;
}

/**
 * Start a password reset.
 *
 * Always answers with the same shape + wording whether or not the account
 * exists, so the endpoint cannot be used to enumerate registered emails. When
 * the account is unknown (or passwordless) no code is stored and none is sent,
 * but the client still receives a challenge that will simply fail to verify.
 */
export async function requestPasswordReset(params: {
  email: string;
  ip?: string;
}): Promise<ForgotPasswordResult> {
  const email = params.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email, status: { $ne: 'suspended' } }).select(
    'email name password',
  );

  if (user && user.email && user.password) {
    const issued = await issueEmailOtp({
      email,
      purpose: 'reset',
      name: user.name ?? undefined,
      ip: params.ip,
    });
    return {
      ...buildOtpChallenge({ userId: String(user._id), email, purpose: 'reset', issued }),
      message: GENERIC_RESPONSE,
    };
  }

  // eslint-disable-next-line no-console
  console.warn('[auth] password reset requested for an unknown or passwordless account');
  return {
    ...buildOtpChallenge({
      userId: '',
      email,
      purpose: 'reset',
      issued: { email, ttlSeconds: OTP_TTL_SECONDS },
    }),
    message: GENERIC_RESPONSE,
  };
}

export interface ResetPasswordResult {
  message: string;
  email?: string;
}

/** Verify the emailed code and set the new password. Single use. */
export async function resetPassword(params: {
  challengeToken: string;
  otp: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  const claims = verifyEmailOtpChallenge(params.challengeToken);
  if (claims.purpose !== 'reset') {
    throw new AppError('Invalid verification session. Please request a new code.', 400);
  }
  if (!claims.sub) {
    throw new AppError('This verification code is invalid. Please request a new one.', 400);
  }

  await consumeEmailOtp({ email: claims.email, purpose: 'reset', code: params.otp });

  const user = await UserModel.findById(claims.sub).select('+password');
  if (!user) throw new AppError('This verification session is invalid. Please start again.', 400);

  user.password = await bcrypt.hash(params.newPassword, 10);
  // A reset implies the owner proved mailbox access.
  if (!user.verified) user.verified = true;
  await user.save();

  // Stateless JWTs cannot be revoked here; existing sessions simply expire.

  if (user.email) {
    await sendPasswordChangedEmail({ to: user.email, name: user.name ?? undefined });
  }

  return {
    message: 'Your password has been reset. You can now sign in.',
    email: user.email ?? undefined,
  };
}
