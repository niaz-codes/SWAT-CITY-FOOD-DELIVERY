import type { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';

type Parsed = Record<string, unknown> | Record<string, unknown>[];

/**
 * validate - validates request body / params / query against a Zod schema.
 * Attaches the validated payload to req.body so later handlers use sanitized data.
 */
export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const target = source === 'body' ? req.body : source === 'params' ? req.params : req.query;
    const result = schema.safeParse(target);
    if (!result.success) {
      const first = result.error.issues[0];
      const message = first
        ? `${first.path.join('.') || 'field'}: ${first.message}`
        : 'Invalid request payload';
      return next(new AppError(message, 422));
    }
    (req as Request & { validated?: Parsed }).validated = result.data as Parsed;
    req.body = result.data;
    next();
  };
}