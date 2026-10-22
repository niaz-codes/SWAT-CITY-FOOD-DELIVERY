import { z } from 'zod';

/**
 * Admin broadcast payload. `title`/`body` are what lands in the in-app list and
 * the push tray; `audience` picks the recipient role set (all app users,
 * customers only, or riders only).
 */
export const adminSendNotificationSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(300),
  audience: z.enum(['all', 'customers', 'riders']),
});
