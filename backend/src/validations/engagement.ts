import { z } from 'zod';
import { idParamSchema } from './restaurant';

/**
 * Chat thread access. The sender/recipient pair is derived from the ORDER on
 * the server (see chat.service) — the client may only supply the message body,
 * so there is nothing else to validate here.
 */
export const chatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message is limited to 1000 characters'),
});

export const chatOrderParamsSchema = idParamSchema;

export const chatListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
