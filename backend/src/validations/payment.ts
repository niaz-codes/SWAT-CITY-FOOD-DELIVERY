import { z } from 'zod';
import { GATEWAY_PAYMENT_METHODS } from '../models';
import { phoneRegex } from './common';

/**
 * A Pakistani mobile number in the format the wallets expect: 03xxxxxxxxx.
 * Callers may send it loosely spaced; we normalise before hitting the gateway.
 */
const phone = z.string().trim().regex(phoneRegex, 'Enter a valid 11-digit mobile number');

export const initiatePaymentSchema = z.object({
  paymentMethod: z.enum(GATEWAY_PAYMENT_METHODS),
  /** Easypaisa MA requires the payer's mobile number. */
  customerPhone: phone.optional(),
  customerEmail: z.string().trim().email().optional(),
  /**
   * Client-generated so a retry or double-tap reuses the same payment instead of
   * charging twice.
   */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const verifyPaymentSchema = z.object({
  /** Either the transaction reference we issued, or our own Payment id. */
  transactionRef: z.string().trim().min(4).max(120).optional(),
  paymentId: z.string().trim().min(4).max(64).optional(),
});

/**
 * Body for submitting a DIRECT transfer proof: the transaction/reference ID the
 * customer received from their bank/wallet app. The receipt screenshot arrives
 * separately as the multipart `receipt` field (checked by the handler), never
 * as a body field. No amount is accepted here — the verified amount is always
 * the server-side order total.
 */
export const manualTransferProofSchema = z.object({
  transactionRef: z
    .string()
    .trim()
    .min(4, 'Enter the transaction/reference ID from your transfer receipt')
    .max(60)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_/]{3,59}$/, 'The reference ID contains invalid characters'),
});

/**
 * Admin verification decision body (normalized without a receipt needed).
 * Reject + request_info must carry a clear reason; approve may optionally note
 * which UBL statement entry was matched.
 */
export const manualPaymentReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'request_info']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => d.decision === 'approve' || (typeof d.reason === 'string' && d.reason.trim().length >= 4),
    { message: 'A reason of at least 4 characters is required', path: ['reason'] },
  );
