import crypto from 'crypto';
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
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as JwtPayload;
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
    }) as JwtPayload;
    if (decoded.type !== 'refresh' || !decoded.sub) throw new Error('bad token');
    return { sub: decoded.sub, type: 'refresh' };
  } catch {
    throw UNAUTHORIZED('Invalid or expired refresh token');
  }
}

/** Short-lived OTP body */
export function generateOtp(length = 6): string {
  const digits = crypto.randomInt(0, 10 ** length).toString().padStart(length, '0');
  return digits;
}

/** MongoDB _id padded to a user-friendly order/ride number: SWT-000123 */
export function humanId(prefix: string, id: string): string {
  const short = id.replace(/[^0-9a-f]/gi, '').slice(-6).toUpperCase();
  return `${prefix}-${short}`;
}

export function randomHex(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
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