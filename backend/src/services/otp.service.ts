// ============================================================
// Swat City Backend - Email OTP (one-time codes)
//
// Supabase Auth owns code generation, delivery and checking:
//   - `signInWithOtp` asks Supabase to generate a code and email it
//   - `verifyOtp` checks the code the user typed
//
// This service keeps the policy around it:
//   - bounded requests per email + purpose (protects the mail quota)
//   - 5 minute lifetime, single use, bounded attempts
//   - issuing a new code invalidates every previous unused code for the
//     same email + purpose, so only the newest email can ever succeed
//
// The raw code never reaches this server at all: Supabase generates it,
// emails it and checks it, so nothing here can log, store or leak it.
//
// Delivery itself is configured in the Supabase dashboard:
//   Authentication -> Emails -> SMTP Settings. Without custom SMTP the
//   built-in service is heavily rate limited and does not reach Gmail
//   reliably, so production MUST use custom SMTP there.
// ============================================================

import { supabaseAdmin } from '../config/supabase';
import { authEmailRedirectUrl } from '../config/env';
import { EmailOtpModel, type EmailOtpPurpose } from '../models';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import { signEmailOtpChallenge } from '../utils/tokens';

export type { EmailOtpPurpose };

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESENDS_PER_WINDOW = 5;

/**
 * How long a code that was just emailed is reused instead of re-sent.
 *
 * Supabase enforces its own per-address cooldown (typically ~60s) and refuses
 * a second send with `over_email_send_rate_limit`. Without this window a
 * second tap on "Sign in" (or a resent code) hit that refusal and the user
 * got an error instead of the code they were already sent.
 */
const RESEND_COOLDOWN_MS = 60 * 1000;

export const OTP_TTL_SECONDS = OTP_TTL_MS / 1000;

/**
 * Marker stored in `email_otps.code_hash`. The code itself lives only inside
 * Supabase Auth — this backend never sees it, so it can never hash or store it.
 */
const SUPABASE_CODE_MARKER = 'supabase-auth';

export interface IssuedOtp {
  email: string;
  purpose: EmailOtpPurpose;
  ttlSeconds: number;
  /**
   * False when Supabase refused (or could not be reached for) the send. The
   * local rate-limit record still exists, but nobody received a code — callers
   * that surface a "we emailed you" screen must treat this as a failure
   * instead of letting the user wait on an email that never arrives.
   */
  emailSent: boolean;
  /**
   * Why the send failed, when it did. `retryAfterSeconds` is Supabase's own
   * cooldown for this address - the number the user has to wait before
   * asking again, which is far more useful than a generic failure.
   */
  sendError?: string;
  retryAfterSeconds?: number;
}

/**
 * What a login / register / reset endpoint answers with when a 6-digit email
 * code still has to be confirmed. No access token is issued until that code is
 * verified. Carries a short-lived challenge token that binds the flow to a
 * specific user + purpose without the client having to send an id.
 */
export interface OtpChallengeResponse {
  otpRequired: true;
  purpose: EmailOtpPurpose;
  email: string;
  challengeToken: string;
  ttlSeconds: number;
}

export function buildOtpChallenge(input: {
  userId: string;
  email: string;
  purpose: EmailOtpPurpose;
  issued: Pick<IssuedOtp, 'email' | 'ttlSeconds'>;
}): OtpChallengeResponse {
  return {
    otpRequired: true,
    purpose: input.purpose,
    email: input.issued.email,
    challengeToken: signEmailOtpChallenge({
      userId: input.userId,
      email: input.issued.email,
      purpose: input.purpose,
    }),
    ttlSeconds: input.issued.ttlSeconds,
  };
}

/**
 * Issue (and email) a fresh code for `email` + `purpose`.
 *
 * Callers must have already resolved the target account (or, for a fresh
 * registration, created it) so the challenge is bound to a real user id.
 */
export async function issueEmailOtp(params: {
  email: string;
  purpose: EmailOtpPurpose;
  name?: string;
  ip?: string;
}): Promise<IssuedOtp> {
  const email = params.email.trim().toLowerCase();

  const recent = await EmailOtpModel.countDocuments({
    email,
    purpose: params.purpose,
    createdAt: { $gte: new Date(Date.now() - RESEND_WINDOW_MS) },
  });
  if (recent >= MAX_RESENDS_PER_WINDOW) {
    throw new AppError(
      'Too many verification codes requested. Please wait a few minutes and try again.',
      429,
    );
  }

  // A code that was emailed moments ago is still valid and still sitting in
  // the user's inbox. Hand it back instead of asking Supabase for another
  // mail: Supabase refuses a second send for the same address while its own
  // cooldown is running, which turned every second tap into a hard error.
  const lastIssued = await EmailOtpModel.findOne({ email, purpose: params.purpose })
    .sort('-createdAt');
  if (
    lastIssued &&
    !lastIssued.usedAt &&
    lastIssued.expiresAt.getTime() > Date.now() &&
    Date.now() - lastIssued.createdAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return {
      email,
      purpose: params.purpose,
      ttlSeconds: Math.max(
        1,
        Math.floor((lastIssued.expiresAt.getTime() - Date.now()) / 1000),
      ),
      emailSent: true,
    };
  }

  // Supabase generates the code, emails it and remembers it. The service-role
  // client authenticates the call, so no anon key is involved here.
  //
  // The send happens BEFORE the local bookkeeping below on purpose: a send
  // that never left must not invalidate a code the user already received,
  // nor burn a rate-limit slot — while mail is down the user keeps seeing
  // the truthful "could not send" error, never a misleading "too many codes".
  const { error } = await supabaseAdmin.auth.signInWithOtp({
    email,
    options: {
      // First contact creates the Supabase Auth account that owns the code.
      // The app's own `users` table remains the source of truth for profiles.
      shouldCreateUser: true,
      // Only used when the dashboard template still renders a link: without an
      // allowed target Supabase falls back to its Site URL (historically
      // http://localhost:3000). Empty by default — the app verifies the code.
      ...(authEmailRedirectUrl ? { emailRedirectTo: authEmailRedirectUrl } : {}),
      // Surfaced to a custom email template if the default one is edited in
      // the dashboard. Never contains the code itself.
      data: { purpose: params.purpose, name: params.name ?? '' },
    },
  });

  if (error) {
    const code = (error as { code?: string }).code ?? 'unknown';
    // eslint-disable-next-line no-console
    console.warn(`[otp] supabase could not send a ${params.purpose} code: [${code}] ${error.message}`);
    // Supabase answers a too-soon request with "you can only request this
    // after N seconds". Pass that number on so the screen can tell the user
    // exactly how long to wait instead of failing with a dead end.
    const waitMatch = /after\s+(\d+)\s+second/i.exec(error.message ?? '');
    return {
      email,
      purpose: params.purpose,
      ttlSeconds: OTP_TTL_SECONDS,
      emailSent: false,
      sendError: error.message,
      ...(waitMatch ? { retryAfterSeconds: Number(waitMatch[1]) } : {}),
    };
  }

  // The email is out: only the newest code may ever succeed (this also burns
  // the old records' attempt counters), and the new record bounds how much
  // mail this address can trigger in the resend window.
  await EmailOtpModel.updateMany(
    { email, purpose: params.purpose, usedAt: null },
    { $set: { usedAt: new Date(), attempts: MAX_ATTEMPTS } },
  );

  await EmailOtpModel.create({
    email,
    purpose: params.purpose,
    codeHash: SUPABASE_CODE_MARKER,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    requestedIp: params.ip ?? '',
  });

  return {
    email,
    purpose: params.purpose,
    ttlSeconds: OTP_TTL_SECONDS,
    emailSent: true,
  };
}

/**
 * Verify and consume the newest code for `email` + `purpose`.
 *
 * Local records enforce lifetime, single use and attempt bounds; the code
 * itself is checked by Supabase Auth. Throws a generic 401 on every failure
 * path so the endpoint cannot be used to probe which addresses or codes are
 * valid.
 */
export async function consumeEmailOtp(params: {
  email: string;
  purpose: EmailOtpPurpose;
  code: string;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  const record = await EmailOtpModel.findOne({ email, purpose: params.purpose, usedAt: null }).sort(
    '-createdAt',
  );
  if (!record)
    throw UNAUTHORIZED('No verification code was requested for this email. Request a new one.');
  if (record.expiresAt.getTime() <= Date.now()) {
    throw UNAUTHORIZED('This verification code has expired. Request a new one.');
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw UNAUTHORIZED('Too many incorrect attempts. Request a new code.');
  }

  await EmailOtpModel.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });

  const { error } = await supabaseAdmin.auth.verifyOtp({
    email,
    token: params.code.trim(),
    type: 'email',
  });
  if (error) {
    const code = (error as { code?: string }).code ?? 'unknown';
    // eslint-disable-next-line no-console
    console.warn(`[otp] supabase rejected a ${params.purpose} code: [${code}] ${error.message}`);
    // Supabase reports a used / timed-out token as `otp_expired`; anything
    // else is a wrong code. Never echo the provider message: it can reveal
    // account state ("user not found", "already confirmed", ...). Both
    // messages point at the working "Resend code" action on the app screen.
    if (code === 'otp_expired' || /expired/i.test(error.message)) {
      throw UNAUTHORIZED('This code has expired or was already used. Request a new one.');
    }
    throw UNAUTHORIZED('Invalid verification code. Check the 6 digits and try again.');
  }

  // A verified human just proved they own the mailbox, so clear this email +
  // purpose's request history: their own earlier sends must never lock them
  // out of the next sign-in. Failed attempts keep their rows, so an attacker
  // who never verifies stays capped at MAX_RESENDS_PER_WINDOW.
  await EmailOtpModel.deleteMany({ email, purpose: params.purpose });
}
