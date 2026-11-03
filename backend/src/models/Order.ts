import { defineModel, type ModelApi } from '../db/model';
import { RestaurantModel } from './Restaurant';
import { PaymentModel } from './Payment';
import { UserModel } from './User';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Payment methods accepted for a food order.
 *
 * `card` is retained for historical records even though no card gateway is wired
 * up: the Order enum is shared with stored data, so removing a value would make
 * existing documents fail validation. New orders may not select it.
 *
 * `ubl`, `easypaisa_transfer` and `jazzcash_transfer` are DIRECT/MANUAL transfer
 * methods: the customer moves the money themselves from their own bank/wallet
 * app into the company account (UBL bank account, or the company Easypaisa /
 * JazzCash mobile account), then submits the transaction reference + receipt
 * screenshot. A screenshot alone is NEVER proof — an authorised admin verifies
 * every submission against the real UBL statement before the order is accepted.
 */
export const PAYMENT_METHODS = [
  'cash',
  'card',
  'wallet',
  'easypaisa',
  'jazzcash',
  'demo',
  'ubl',
  'easypaisa_transfer',
  'jazzcash_transfer',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Methods that require a verified payment round-trip before an order is paid.
 * `demo` belongs here because a demo payment settles on the server (the backend
 * IS its verifier) instead of on delivery — it just never talks to a real bank,
 * and `demoPaymentsEnabled` gates when it exists at all.
 */
export const GATEWAY_PAYMENT_METHODS = ['easypaisa', 'jazzcash', 'demo'] as const;
export type GatewayPaymentMethod = (typeof GATEWAY_PAYMENT_METHODS)[number];

/**
 * Methods where the customer transfers the money DIRECTLY into company-owned
 * accounts and an admin verifies the transfer against the bank statement.
 * These rows carry `gateway: 'manual'` on the Payment — the stored value is the
 * transfer destination, never a live API integration.
 */
export const MANUAL_TRANSFER_METHODS = [
  'ubl',
  'easypaisa_transfer',
  'jazzcash_transfer',
] as const;
export type ManualTransferMethod = (typeof MANUAL_TRANSFER_METHODS)[number];

/**
 * The receiving account a manual method points at. `ubl` is the bank account;
 * the wallet names are the company's own consumer mobile-money numbers.
 */
export type ManualTransferChannel = 'ubl' | 'easypaisa' | 'jazzcash';

export const MANUAL_CHANNEL_BY_METHOD: Record<
  ManualTransferMethod,
  ManualTransferChannel
> = {
  ubl: 'ubl',
  easypaisa_transfer: 'easypaisa',
  jazzcash_transfer: 'jazzcash',
};

/**
 * Methods a customer may pick at checkout for a food order. Since the
 * screenshot-verification flow became the platform's payment method, this is
 * exactly the direct-transfer set: the checkout validation
 * (`validations/order.ts`) rejects everything else, so no order can be opened
 * on a wallet, cash or card scheme any more. `card` was the first to go (no
 * card gateway is integrated and the old code silently recorded card orders as
 * cash payments), then the wallet gateways and cash.
 */
export const ORDER_CHECKOUT_METHODS = [...MANUAL_TRANSFER_METHODS] as const;
export type OrderCheckoutMethod = (typeof ORDER_CHECKOUT_METHODS)[number];

export function isGatewayPaymentMethod(value: unknown): value is GatewayPaymentMethod {
  return (
    typeof value === 'string' && (GATEWAY_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

export function isManualTransferMethod(value: unknown): value is ManualTransferMethod {
  return (
    typeof value === 'string' && (MANUAL_TRANSFER_METHODS as readonly string[]).includes(value)
  );
}

export function manualChannelForMethod(method: string): ManualTransferChannel | null {
  return isManualTransferMethod(method) ? MANUAL_CHANNEL_BY_METHOD[method] : null;
}

/**
 * Payment status is deliberately independent of the order lifecycle:
 * an order can be `pending` in the kitchen while its payment is `paid`, and an
 * order can be `cancelled` while its payment is `refunded`.
 *
 * Manual-transfer lifecycle additions:
 *   pending_verification  the customer submitted a transaction reference and
 *                         receipt; an admin must now check the UBL statement.
 *   rejected              the admin compared the submission with the bank
 *                         account and it did not match. The customer may
 *                         resubmit correct proof (bounded attempts).
 *   paid                  the admin CONFIRMED the transfer. Only this state —
 *                         never a customer upload — means the money arrived.
 *
 * The full manual flow: pending → pending_verification → paid (or rejected →
 * resubmit → pending_verification → …). An order is never auto-accepted and a
 * rider is never assigned while the payment is not `paid`.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'pending_verification',
  'rejected',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface OrderItemSnapshot {
  foodItem?: string | null;
  name: string;
  quantity: number;
  price: number;
  emoji?: string | null;
  note?: string | null;
}

export interface OrderStatusEvent {
  status?: OrderStatus | string | null;
  note?: string | null;
  at?: Date | null;
}

export interface Order {
  _id: string;

  orderNumber?: string | null;

  customer: string;
  restaurant: string;
  rider?: string | null;

  /** Embedded line items (snapshot of price at purchase time). */
  items: OrderItemSnapshot[];

  status: OrderStatus;
  previousStatus?: string | null;
  statusHistory: OrderStatusEvent[];

  addressSnapshot?: {
    full: string;
    area?: string | null;
    lat?: number | null;
    lng?: number | null;
    tag?: string | null;
  } | null;

  // Totals are ALWAYS computed server-side from DB pricing.
  subtotal: number;
  deliveryFee: number;
  discount: number;
  platformFee: number;
  total: number;

  distanceKm: number;
  estimatedMinutes: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  payment?: string | null;

  paymentGateway?: string | null;
  paymentTransactionRef?: string | null;
  /** Set only after the gateway itself confirmed the money moved. */
  paymentVerifiedAt?: Date | null;
  paymentFailureReason?: string | null;
  paymentVerifyAttempts: number;

  riderPayout: number;

  /** Free-text delivery instructions captured at checkout. */
  note?: string | null;

  /**
   * Scheduled delivery: when present, the kitchen treats this order as
   * "cook for this window" — it is placed and paid like any other order, but
   * the restaurant/admin know it must be cooked to be ready around this time
   * instead of immediately. Validated to be 30 min – 7 days ahead.
   */
  scheduledFor?: Date | null;

  /** Tip captured at checkout (already included in `total`). */
  tip?: number | null;

  /** Loyalty points redeemed into this order (and their Rs value). */
  loyaltyPointsRedeemed?: number | null;
  loyaltyDiscount?: number | null;
  /** Points awarded when the order was delivered. */
  loyaltyPointsEarned?: number | null;

  cancelReason?: string | null;
  cancelledBy?: string | null;

  /**
   * Automatic rider-dispatch bookkeeping (never client-writable):
   * the offer rounds pushed to online riders while the order waits in the
   * `ready` pool — used by the sweeper to re-broadcast and to alert admins
   * when no rider has claimed (or nobody is online at all).
   */
  dispatchStartedAt?: Date | null;
  dispatchLastOfferAt?: Date | null;
  dispatchAttempts?: number | null;
  dispatchLastAdminAlertAt?: Date | null;

  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderModel: ModelApi<Order> = defineModel<Order>({
  table: 'orders',
  columns: [
    'orderNumber',
    'customer',
    'restaurant',
    'rider',
    'items',
    'status',
    'previousStatus',
    'statusHistory',
    'addressSnapshot',
    'subtotal',
    'deliveryFee',
    'discount',
    'platformFee',
    'total',
    'distanceKm',
    'estimatedMinutes',
    'paymentMethod',
    'paymentStatus',
    'payment',
    'paymentGateway',
    'paymentTransactionRef',
    'paymentVerifiedAt',
    'paymentFailureReason',
    'paymentVerifyAttempts',
    'riderPayout',
    'note',
    'scheduledFor',
    'tip',
    'loyaltyPointsRedeemed',
    'loyaltyDiscount',
    'loyaltyPointsEarned',
    'cancelReason',
    'cancelledBy',
    'dispatchStartedAt',
    'dispatchLastOfferAt',
    'dispatchAttempts',
    'dispatchLastAdminAlertAt',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    customer: () => UserModel,
    rider: () => UserModel,
    restaurant: () => RestaurantModel,
    payment: () => PaymentModel,
  },
});
