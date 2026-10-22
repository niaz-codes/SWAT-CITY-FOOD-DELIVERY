import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  id?: string;
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Assigns a stable request id to every request — or trusts a well-formed one the
 * client already sent — and reflects it back on the `X-Request-Id` response
 * header so a failing request can be matched to its log line and support ticket.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  (req as RequestWithId).id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
