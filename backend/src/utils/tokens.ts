import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UNAUTHORIZED } from './AppError';

export interface AccessClaims {
  sub: string;
  role: 'customer' | 'rider' | 'admin';
  type: 'access';
}

export interface RefreshClaims {
  sub: string;
  type: 'refresh';
}

export function signAccessToken(userId: string, role: AccessClaims['role']): string {
  const payload: AccessClaims = { sub: userId, role, type: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
  });
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshClaims = { sub: userId, type: 'refresh' };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
      algorithms: ['HS256'],
    }) as JwtPayload;
    if (decoded.type !== 'access' || !decoded.sub || !decoded.role) throw new Error('bad token');
    return { sub: decoded.sub, role: decoded.role as AccessClaims['role'], type: 'access' };
  } catch {
    throw UNAUTHORIZED('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: env.JWT_ISSUER,
      algorithms: ['HS256'],
    }) as JwtPayload;
    if (decoded.type !== 'refresh' || !decoded.sub) throw new Error('bad token');
    return { sub: decoded.sub, type: 'refresh' };
  } catch {
    throw UNAUTHORIZED('Invalid or expired refresh token');
  }
}

/**
 * Short-lived challenge token that carries a half-finished email-OTP flow.
 *
 * It proves "this browser passed the password / registration step for this
 * email" so the OTP-verify endpoint can look the account up without trusting a
 * client-supplied id. It is deliberately NOT an access token: it has no `role`,
 * is not accepted by `requireAuth`, and cannot log anyone in. It only allows the
 * code step of a flow that is already half-finished.
 */
export type EmailOtpPurpose = 'login' | 'register' | 'reset';

export interface EmailOtpChallengeClaims {
  sub: string;
  email: string;
  purpose: EmailOtpPurpose;
  type: 'email-otp';
}

export function signEmailOtpChallenge(input: {
  userId: string;
  email: string;
  purpose: EmailOtpPurpose;
}): string {
  return jwt.sign(
    { sub: input.userId, email: input.email, purpose: input.purpose, type: 'email-otp' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: '10m', issuer: env.JWT_ISSUER },
  );
}

export function verifyEmailOtpChallenge(token: string): EmailOtpChallengeClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: env.JWT_ISSUER,
      algorithms: ['HS256'],
    }) as JwtPayload;
    if (decoded.type !== 'email-otp' || !decoded.email || !decoded.purpose) {
      throw new Error('bad token');
    }
    const purpose = String(decoded.purpose) as EmailOtpPurpose;
    if (purpose !== 'login' && purpose !== 'register' && purpose !== 'reset') {
      throw new Error('bad purpose');
    }
    return {
      sub: decoded.sub ? String(decoded.sub) : '',
      email: String(decoded.email),
      purpose,
      type: 'email-otp',
    };
  } catch {
    throw UNAUTHORIZED('This verification session expired. Please start again.');
  }
}

/** Record _id padded to a user-friendly order/ride number: SWT-000123 */
export function humanId(prefix: string, id: string): string {
  const short = id
    .replace(/[^0-9a-f]/gi, '')
    .slice(-6)
    .toUpperCase();
  return `${prefix}-${short}`;
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
