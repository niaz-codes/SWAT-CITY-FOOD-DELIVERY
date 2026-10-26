import type { NextFunction, Request, Response } from 'express';
import { UserModel, type UserRole } from '../models';
import { AppError, UNAUTHORIZED } from '../utils/AppError';
import { verifyAccessToken } from '../utils/tokens';

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: UserRole;
  };
}

/**
 * requireAuth - attaches the authenticated user to the request.
 * Reads the Bearer access token. Falls back to an x-auth-token header (mobile convenience).
 */
export async function requireAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization || req.headers['x-auth-token'];
    if (!header || typeof header !== 'string') {
      throw UNAUTHORIZED('Access token is required');
    }
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    const claims = verifyAccessToken(token);
    const user = await UserModel.findById(claims.sub).select('_id role status verified').lean();
    if (!user) throw UNAUTHORIZED('Account no longer exists');
    if (user.status === 'suspended') throw new AppError('Account is suspended', 403);
    // A session is only ever minted after email verification, so an unverified
    // account holding a token means a stale/buggy client: refuse it.
    if (!user.verified) throw new AppError('Please verify your email address to continue', 403);

    req.user = { _id: String(user._id), role: user.role as UserRole };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(
  ...roles: UserRole[]
): (req: AuthRequest, _res: Response, next: NextFunction) => void {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireRider = requireRole('rider');
export const requireCustomer = requireRole('customer');
export const requireRestaurant = requireRole('restaurant');
