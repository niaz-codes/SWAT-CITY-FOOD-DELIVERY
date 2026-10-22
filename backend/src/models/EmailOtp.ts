import { defineModel } from '../db/model';

export const EMAIL_OTP_PURPOSES = ['login', 'register', 'reset'] as const;
export type EmailOtpPurpose = (typeof EMAIL_OTP_PURPOSES)[number];

/**
 * A single emailed one-time code.
 *
 * The code itself is generated, emailed and checked by Supabase Auth — this
 * table only tracks the request so the service can enforce policy:
 *
 *  - `codeHash` is a marker (`supabase-auth`), never the raw code: there is
 *    nothing here to leak even if the database does.
 *  - `expiresAt` is enforced on every read (the app promises a 5-minute code).
 *  - `attempts` is incremented on every failed verification and the record is
 *    burned once it exceeds the configured maximum.
 *  - Issuing a new code marks every previous unused code for the same
 *    email + purpose as used, so only the newest email can ever succeed.
 *  - Rows per email + purpose in the resend window bound how much mail a
 *    single address can trigger.
 */
export interface EmailOtp {
  _id: string;

  /** Lower-cased recipient address. */
  email: string;
  purpose: EmailOtpPurpose;

  /** HMAC-SHA256(email:purpose:code) — never the raw code. */
  codeHash: string;

  attempts: number;
  usedAt: Date | null;

  /** Absolute expiry; always checked by the service. */
  expiresAt: Date;

  /** Short, non-sensitive code so we can prune old rows without full scans. */
  requestedIp: string;

  createdAt: Date;
  updatedAt: Date;
}

export const EmailOtpModel = defineModel<EmailOtp>({
  table: 'email_otps',
  columns: [
    'email',
    'purpose',
    'codeHash',
    'attempts',
    'usedAt',
    'expiresAt',
    'requestedIp',
    'createdAt',
    'updatedAt',
  ],
});
