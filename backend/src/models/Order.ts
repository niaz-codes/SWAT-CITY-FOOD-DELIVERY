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
 */
export const PAYMENT_METHODS = ['cash', 'card', 'wallet', 'easypaisa', 'jazzcash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Methods that require a verified gateway round-trip before an order is paid. */
export const GATEWAY_PAYMENT_METHODS = ['easypaisa', 'jazzcash'] as const;
export type GatewayPaymentMethod = (typeof GATEWAY_PAYMENT_METHODS)[number];

/**
 * Methods a customer may pick at checkout for a food order.
 * `card` is deliberately absent: no card gateway is integrated, and the old code
 * silently recorded card orders as cash payments.
 */
export const ORDER_CHECKOUT_METHODS = ['cash', 'wallet', 'easypaisa', 'jazzcash'] as const;
export type OrderCheckoutMethod = (typeof ORDER_CHECKOUT_METHODS)[number];

export function isGatewayPaymentMethod(value: unknown): value is GatewayPaymentMethod {
  return (
    typeof value === 'string' && (GATEWAY_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/**
 * Payment status is deliberately independent of the order lifecycle:
 * an order can be `pending` in the kitchen while its payment is `paid`, and an
 * order can be `cancelled` while its payment is `refunded`.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
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
  cancelReason?: string | null;
  cancelledBy?: string | null;

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
    'cancelReason',
    'cancelledBy',
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
