import type { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

/** Standard success body: { success: true, data: {...} , meta?: {...} } */
export function sendSuccess<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(200).json(body);
}

export function sendCreated<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data });
}

/** Standard error body: { success: false, message } */
export function sendError(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ success: false, message });
}