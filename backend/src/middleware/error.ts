import type { NextFunction, Response } from 'express';
import { env, isProduction } from '../config/env';
import { NOT_FOUND } from '../utils/AppError';
import { sendError } from '../utils/respond';
import type { RequestWithId } from './requestId';

// 404 for unknown routes
export function notFound(req: RequestWithId, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`, { requestId: req.id });
}

// Centralized error handler - the only place that converts exceptions to responses.
export function errorHandler(
  err: unknown,
  req: RequestWithId,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod 422 (unusual path, validate() normally prevents reaching here)
  if (isZodError(err)) {
    return sendError(res, 422, err.issues[0]?.message ?? 'Invalid request payload', {
      requestId: req.id,
    });
  }

  // Multer file limit
  if (isMulterError(err)) {
    return sendError(res, 400, (err as { message: string }).message, { requestId: req.id });
  }

  // Postgres constraint violations surfaced by the Supabase data layer
  if (isPostgresDuplicate(err)) {
    return sendError(res, 409, 'Duplicate value: a record with that value already exists', {
      requestId: req.id,
    });
  }
  if (isPostgresCheck(err)) {
    // The raw CHECK message carries the constraint/table names, which leaks
    // schema details. Log it server-side and return a generic client message.
    // eslint-disable-next-line no-console
    console.error(`[check-violation] req=${req.id ?? '-'}`, firstLine((err as { message: string }).message));
    return sendError(res, 422, 'One of the fields violates a database constraint', {
      requestId: req.id,
    });
  }
  if (isPostgresInvalidTextValue(err)) {
    return sendError(res, 400, 'Invalid value for one or more fields', { requestId: req.id });
  }

  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  const message = (err as { message?: string }).message || 'Internal server error';
  const requestId = req.id;

  if (statusCode === 401) {
    return sendError(res, 401, message, { requestId }); // don't leak server details on auth failures
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[error] req=${requestId ?? '-'}`, err);
    // An operational error (AppError) means the request itself was understood
    // and failed for a reason the client can act on - "the mail provider is
    // cooling down, try again in a moment" is far more useful than a blanket
    // "Internal server error", which sends the user hunting for a bug that is
    // not there. Unexpected failures keep the generic message.
    const operational = (err as { isOperational?: boolean }).isOperational === true;
    if (operational) {
      return sendError(res, statusCode, message, { requestId });
    }
    return sendError(res, 500, isProduction ? 'Internal server error' : message, { requestId });
  }

  sendError(res, statusCode, message, { requestId });
}

// Convenience 404 for named resources used by controllers.
export { NOT_FOUND };

function isZodError(err: unknown): err is { issues: { message: string }[] } {
  return (
    typeof err === 'object' && err !== null && Array.isArray((err as { issues?: unknown }).issues)
  );
}

function isMulterError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}

function postgresCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function isPostgresDuplicate(err: unknown): boolean {
  // unique_violation
  return postgresCode(err) === '23505';
}

function isPostgresCheck(err: unknown): boolean {
  // check_violation (CHECK constraints stand in for schema enums)
  return postgresCode(err) === '23514';
}

function isPostgresInvalidTextValue(err: unknown): boolean {
  // invalid_text_representation (e.g. malformed uuid)
  return postgresCode(err) === '22P02';
}

function firstLine(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.split('\n')[0];
}

export { env };
