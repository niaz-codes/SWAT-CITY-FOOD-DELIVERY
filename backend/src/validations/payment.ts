import { z } from 'zod';
import { GATEWAY_PAYMENT_METHODS } from '../models';

/**
 * A Pakistani mobile number in the format the wallets expect: 03xxxxxxxxx.
 * Callers may send it loosely spaced; we normalise before hitting the gateway.
 */
const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?92|0)?3\d{9}$/, 'Enter a valid 11-digit mobile number');

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

export const abandonPaymentSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

/** At least one identifier is required to resolve a payment. */
export const verifyPaymentStrictSchema = verifyPaymentSchema.refine(
  (v) => Boolean(v.transactionRef || v.paymentId),
  { message: 'transactionRef or paymentId is required', path: ['transactionRef'] },
);