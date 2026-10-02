import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env, isProduction } from '../config/env';
import { NOT_FOUND, sendError } from '../utils';

// 404 for unknown routes
export function notFound(req: Request, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

// Centralized error handler - the only place that converts exceptions to responses.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod 422 (unusual path, validate() normally prevents reaching here)
  if (isZodError(err)) {
    return sendError(res, 422, err.issues[0]?.message ?? 'Invalid request payload');
  }

  // Multer file limit
  if (isMulterError(err)) {
    return sendError(res, 400, (err as { message: string }).message);
  }

  // Mongoose validation / cast / duplicate key
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return sendError(res, 422, first?.message ?? 'Validation failed');
  }
  if (err instanceof mongoose.Error.CastError) {
    return sendError(res, 400, `Invalid ${String(err.path)}`);
  }
  if (isMongoDuplicate(err)) {
    return sendError(res, 409, 'Duplicate value: a record with that value already exists');
  }

  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  const message = (err as { message?: string }).message || 'Internal server error';

  if (statusCode === 401) {
    return sendError(res, 401, message); // don't leak server details on auth failures
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    return sendError(
      res,
      500,
      isProduction ? 'Internal server error' : message,
    );
  }

  sendError(res, statusCode, message);
}

// Convenience 404 for named resources used by controllers.
export { NOT_FOUND };

function isZodError(err: unknown): err is { issues: { message: string }[] } {
  return typeof err === 'object' && err !== null && Array.isArray((err as { issues?: unknown }).issues);
}

function isMulterError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}

function isMongoDuplicate(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

export { env };