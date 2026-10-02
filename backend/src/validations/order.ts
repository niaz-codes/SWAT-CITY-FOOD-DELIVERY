import { z } from 'zod';
import { ORDER_STATUSES, ORDER_CHECKOUT_METHODS } from '../models';

export const placeOrderSchema = z.object({
  addressId: z.string().min(3, 'Select a delivery address'),
  /**
   * `card` is intentionally not accepted: no card gateway is integrated and the
   * previous implementation silently stored card orders as cash.
   */
  paymentMethod: z.enum(ORDER_CHECKOUT_METHODS).default('cash'),
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
    .regex(/^(?:\+?92|0)?3\d{9}$/, 'Enter a valid 11-digit mobile number')
    .optional(),
  customerEmail: z.string().trim().email().optional(),
  /** Client-generated so a retry reuses the same payment instead of charging twice. */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const quoteOrderSchema = z.object({
  promoCode: z.string().trim().max(30).optional(),
  tip: z.coerce.number().min(0).max(5000).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to cancel').max(200),
});

export const statusParamSchema = z.object({
  id: z.string().min(3),
});

/** Admin/rider may only advance to the next valid lifecycle state. */
export const advanceOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});