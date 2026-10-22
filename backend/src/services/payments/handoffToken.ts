import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

/**
 * Short-lived signed tokens for public handoff links.
 *
 * The JazzCash checkout page is served without authentication (the payer is in a
 * browser, not our app session), so the payment id cannot be trusted as a secret:
 * it is a guessable ObjectId. Instead the client receives a signed token that
 * proves "this payment handoff was issued by us, for this payment, just now".
 */

const PURPOSE = 'payment-handoff';
const PREFIX = 'ph1';

/** Handoff links expire quickly; the payment's own expiry is the real limit. */
const HANDOFF_TTL_MS = 15 * 60_000;

function sign(payload: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
}

/**
 * `<nonce>.<paymentId>.<expiresAt>` signed with the server secret.
 *
 * The nonce is essential: without it the only unknown in a token would be a
 * millisecond expiry inside a 15 minute window — roughly 900k candidates, which
 * is cheap to brute-force even against an HMAC. The nonce makes guessing the
 * signature pointless.
 */
export function createHandoffToken(paymentId: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + HANDOFF_TTL_MS;
  const body = `${PURPOSE}|${nonce}|${paymentId}|${expiresAt}`;
  return `${PREFIX}.${expiresAt}.${Buffer.from(body, 'utf8').toString('base64url')}.${sign(body)}`;
}

/**
 * Returns the payment id the token authorises, or `null` when the token is
 * malformed, forged, or past its expiry. Signature comparison is constant-time.
 */
export function readHandoffToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [prefix, expiresAtRaw, payload, signature] = parts;
  if (prefix !== PREFIX) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  let body: string;
  try {
    body = Buffer.from(payload ?? '', 'base64url').toString('utf8');
  } catch {
    return null;
  }

  // Verify before trusting any part of the body. `timingSafeEqual` throws on a
  // length mismatch, which is itself a rejection.
  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature ?? '');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const [purpose, nonce, paymentId] = body.split('|');
  if (purpose !== PURPOSE || !nonce || !paymentId) return null;

  return paymentId;
}
