import { z } from 'zod';
import { MANUAL_TRANSFER_METHODS } from '../models';
import { phoneRegex } from './common';

export const placeOrderSchema = z.object({
  addressId: z.string().min(3, 'Select a delivery address'),
  /**
   * Direct-transfer methods ONLY. `card` was already rejected (no card gateway
   * is integrated and the old code silently stored card orders as cash), and
   * the integrated gateway wallets (easypaisa/jazzcash/demo) are no longer part
   * of this platform's checkout: the customer pays by hand into a company
   * account and an admin verifies the receipt against the statement. Enforced
   * here so no client — however tampered — can open a wallet-charged order.
   * There is no default: an order must state its method.
   */
  paymentMethod: z.enum(MANUAL_TRANSFER_METHODS),
  // Optional (server-validated, never trusted): promo code
  promoCode: z.string().trim().max(30).optional(),
  // Optional tip for the rider
  tip: z.number().min(0).max(5000).optional(),
  note: z.string().trim().max(300).optional(),
  /**
   * Easypaisa MA debits a wallet and therefore needs the payer's number.
   * JazzCash collects it on its own hosted page, so it is optional there.
   */
  customerPhone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Enter a valid 11-digit mobile number')
    .optional(),
  customerEmail: z.string().trim().email().optional(),
  /** Client-generated so a retry reuses the same payment instead of charging twice. */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  /** Loyalty points redeeming into this order (server caps/validates the count). */
  redeemPoints: z.number().int().min(0).max(100000).optional(),
  /**
   * Scheduled delivery slot: ISO datetime 30 min – 7 days ahead. The order
   * service revalidates the window server-side (never trust a client clock).
   */
  scheduledFor: z.string().datetime({ offset: true }).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to cancel').max(200),
});
