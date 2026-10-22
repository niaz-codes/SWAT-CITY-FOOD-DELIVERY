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
