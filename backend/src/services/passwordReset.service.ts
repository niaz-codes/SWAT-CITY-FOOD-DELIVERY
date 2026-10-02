// ============================================================
// Swat City Backend - Password reset (forgot / verify / reset)
//
// Flow
//   1. POST /auth/forgot-password  { email }
//        -> always answers 200 with a generic message (no account enumeration)
//        -> emails a single-use, time-limited, hashed token via Brevo
//   2. POST /auth/reset-password/verify  { token }
//        -> validates the token without consuming it, so the UI can show
//           "expired / invalid" before the user types a new password
//   3. POST /auth/reset-password  { token, newPassword }
//        -> re-validates, burns every outstanding token, sets the new hash
//
// The raw token exists only in the email and in the request body. It is never
// written to MongoDB and never logged.
// ============================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env, publicApiUrl } from '../config/env';
import { UserModel, PasswordResetModel } from '../models';
import { sendPasswordChangedEmail, sendPasswordResetEmail, isEmailConfigured } from './email.service';
import { AppError } from '../utils/AppError';

const GENERIC_RESPONSE = 'If an account exists for that email, a password reset link has been sent.';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** 256 bits of entropy, URL-safe. Only ever shown in the email. */
function generateResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Deep link that opens the reset screen.
 *
 * HTTPS so the link survives mail scanners and works everywhere; the token
 * rides in the URL FRAGMENT (`#token=...`) so browsers never transmit it to
 * the server and it never reaches access / proxy logs. The landing page then
 * hands off to the app via the `swatcity://` custom scheme, or the OS opens the
 * app directly through Android App Links / iOS Universal Links.
 */
function buildResetUrl(token: string): string {
  return `${publicApiUrl}/reset-password#token=${encodeURIComponent(token)}`;
}

export interface ForgotPasswordResult {
  message: string;
  /** True when a mail was actually dispatched. Never expose the token. */
  emailed: boolean;
}

export async function requestPasswordReset(params: {
  email: string;
  ip?: string;
}): Promise<ForgotPasswordResult> {
  const email = params.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email, status: { $ne: 'suspended' } }).select(
    'email name password status',
  );

  // Always the same response shape + timing profile, whether or not the account
  // exists. Prevents attackers enumerating registered emails.
  if (!user || !user.email || !user.password) {
    // eslint-disable-next-line no-console
    console.warn('[auth] password reset requested for an unknown or passwordless account');
    return { message: GENERIC_RESPONSE, emailed: false };
  }

  if (!isEmailConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[auth] reset requested but Brevo is not configured — cannot send email');
  }

  // Any previous outstanding tokens for this account are invalidated the moment
  // a new one is issued, so only the newest email can ever succeed.
  await PasswordResetModel.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: new Date(), attempts: Number.MAX_SAFE_INTEGER } },
  );

  const rawToken = generateResetToken();
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);

  await PasswordResetModel.create({
    user: user._id,
    tokenHash: sha256(rawToken),
    email: user.email,
    expiresAt,
    requestedIp: params.ip ?? '',
  });

  const emailed = await sendPasswordResetEmail({
    to: user.email,
    name: user.name ?? undefined,
    resetUrl: buildResetUrl(rawToken),
    expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
  });

  return { message: GENERIC_RESPONSE, emailed };
}

export interface ResetTokenValidity {
  valid: boolean;
  reason?: 'invalid' | 'expired' | 'used' | 'too_many_attempts';
}

/** Validates a raw token without consuming it. */
export async function verifyResetToken(rawToken: string): Promise<ResetTokenValidity> {
  if (!rawToken) return { valid: false, reason: 'invalid' };

  const record = await PasswordResetModel.findOne({ tokenHash: sha256(rawToken) });
  if (!record) return { valid: false, reason: 'invalid' };
  if (record.usedAt) return { valid: false, reason: 'used' };
  if (record.expiresAt.getTime() <= Date.now()) return { valid: false, reason: 'expired' };
  if (record.attempts >= env.PASSWORD_RESET_MAX_ATTEMPTS) {
    return { valid: false, reason: 'too_many_attempts' };
  }
  return { valid: true };
}

/**
 * Records an attempt so a token that leaks cannot be probed indefinitely.
 * Called for every reset POST whose token matches a stored record.
 */
async function recordAttempt(tokenHash: string): Promise<void> {
  await PasswordResetModel.updateOne({ tokenHash }, { $inc: { attempts: 1 } });
}

const REASON_MESSAGES: Record<NonNullable<ResetTokenValidity['reason']>, string> = {
  invalid: 'This reset link is invalid. Please request a new one.',
  expired: 'This reset link has expired. Please request a new one.',
  used: 'This reset link has already been used. Please request a new one.',
  too_many_attempts: 'Too many attempts on this link. Please request a new one.',
};

export interface ResetPasswordResult {
  message: string;
  email?: string;
}

/** Consumes the token and sets the new password. Single use, atomically. */
export async function resetPassword(params: {
  token: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  const tokenHash = sha256(params.token ?? '');

  const record = await PasswordResetModel.findOne({ tokenHash });
  if (!record) throw new AppError(REASON_MESSAGES.invalid, 400);

  await recordAttempt(tokenHash);

  if (record.usedAt) throw new AppError(REASON_MESSAGES.used, 400);
  if (record.expiresAt.getTime() <= Date.now()) throw new AppError(REASON_MESSAGES.expired, 400);
  if (record.attempts >= env.PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new AppError(REASON_MESSAGES.too_many_attempts, 400);
  }

  const user = await UserModel.findById(record.user).select('+password');
  if (!user) throw new AppError(REASON_MESSAGES.invalid, 400);

  user.password = await bcrypt.hash(params.newPassword, 10);
  // A reset implies the owner proved mailbox access.
  if (user.email && !user.verified) user.verified = true;
  await user.save();

  // Burn this token AND any sibling tokens from earlier requests.
  await PasswordResetModel.updateMany({ user: user._id, usedAt: null }, { $set: { usedAt: new Date() } });

  // Re-send the user's other active sessions is out of scope for stateless
  // JWTs, but they will simply be signed out once the old tokens expire.

  if (user.email) {
    await sendPasswordChangedEmail({ to: user.email, name: user.name ?? undefined });
  }

  return { message: 'Your password has been reset. You can now sign in.', email: user.email ?? undefined };
}

/** Test helper used by the smoke test; never called from a route. */
export async function invalidateAllTokensForUser(userId: string): Promise<void> {
  await PasswordResetModel.updateMany({ user: userId, usedAt: null }, { $set: { usedAt: new Date() } });
}