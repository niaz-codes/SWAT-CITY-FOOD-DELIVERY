// Centralized app error type. All request errors are thrown as AppError,
// then translated by the global error handler into the standard response shape.

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const NOT_FOUND = (resource = 'Resource') => new AppError(`${resource} not found`, 404);
export const UNAUTHORIZED = (message = 'Not authorized') => new AppError(message, 401);
export const FORBIDDEN = (message = 'You do not have permission to perform this action') =>
  new AppError(message, 403);
export const BAD_REQUEST = (message = 'Invalid request') => new AppError(message, 400);
export const CONFLICT = (message = 'Resource already exists') => new AppError(message, 409);
