import mongoose, { type InferSchemaType, Schema } from 'mongoose';

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

/** Methods that a customer may actively select at checkout. */
export const SELECTABLE_PAYMENT_METHODS = ['cash', 'easypaisa', 'jazzcash'] as const;
export type SelectablePaymentMethod = (typeof SELECTABLE_PAYMENT_METHODS)[number];

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

export function isGatewayPaymentMethod(
  value: unknown,
): value is GatewayPaymentMethod {
  return typeof value === 'string' && (GATEWAY_PAYMENT_METHODS as readonly string[]).includes(value);
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

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, sparse: true },

    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // Embedded line items (snapshot of price at purchase time).
    items: [
      {
        _id: false,
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem' },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        emoji: { type: String },
        note: { type: String },
      },
    ],

    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    previousStatus: { type: String },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES },
        note: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],

    addressSnapshot: {
      full: { type: String, required: true },
      area: { type: String },
      lat: { type: Number },
      lng: { type: Number },
      tag: { type: String },
    },

    // Totals are ALWAYS computed server-side from DB pricing.
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },

    distanceKm: { type: Number, default: 0 },
    estimatedMinutes: { type: Number, default: 30 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },

    // Gateway bookkeeping. `paymentTransactionRef` is the reference WE generated
    // and handed to the gateway; it is the handle used for server-side inquiry.
    paymentGateway: { type: String },
    paymentTransactionRef: { type: String },
    /** Set only after the gateway itself confirmed the money moved. */
    paymentVerifiedAt: { type: Date, default: null },
    paymentFailureReason: { type: String },
    /** How many times we have asked the gateway about this transaction. */
    paymentVerifyAttempts: { type: Number, default: 0 },

    riderPayout: { type: Number, default: 0 },
    cancelReason: { type: String },
    cancelledBy: { type: String, enum: ['customer', 'rider', 'admin', 'system'] },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });
orderSchema.index({ rider: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

export type Order = InferSchemaType<typeof orderSchema> & { _id: mongoose.Types.ObjectId };

export const OrderModel = mongoose.model('Order', orderSchema);