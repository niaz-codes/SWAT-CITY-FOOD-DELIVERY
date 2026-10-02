import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// Enum arrays are kept local; Order.ts is the canonical exporter of
// PAYMENT_METHODS / PAYMENT_STATUSES (they represent the same values).
const PAYMENT_METHODS = ['cash', 'card', 'wallet', 'easypaisa', 'jazzcash'] as const;
const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
] as const;

/**
 * Lifecycle of an online payment record.
 *
 *   pending     record created, gateway not contacted yet
 *   processing  gateway accepted the initiation, waiting for the payer
 *   paid        gateway CONFIRMED the money (never set from a browser redirect)
 *   failed      gateway confirmed a failure
 *   cancelled   payer abandoned / window expired, no money involved
 *   refunded    money returned to the payer
 */
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // What this payment is for: order | ride | topup | refund
    kind: { type: String, enum: ['order', 'ride', 'topup', 'refund'], required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride' },

    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },

    /**
     * Client-supplied idempotency key. The unique index is what actually stops a
     * double-tap or a retried request from creating a second payment/order.
     */
    idempotencyKey: { type: String },

    gateway: { type: String, default: 'cash' },

    /** Reference WE generated and sent to the gateway (its primary lookup key). */
    transactionRef: { type: String },

    /** Reference the gateway handed back: Easypaisa paymentToken / Jazz RRN. */
    gatewayRef: { type: String },

    /** Gateway's own response code, kept verbatim for support/disputes. */
    gatewayResponseCode: { type: String },

    /** Timestamps that make the lifecycle auditable. */
    initiatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    /** When a still-unpaid online payment stops being payable. */
    expiresAt: { type: Date, default: null },

    /**
     * Number of times we performed a server-side gateway inquiry. Used to bound
     * verification attempts and to detect a gateway that never settles.
     */
    verifyAttempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },

    failureReason: { type: String },

    /**
     * Sanitised gateway responses. Credentials and SecureHash values are stripped
     * before anything is written here.
     */
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

paymentSchema.index({ user: 1, kind: 1, createdAt: -1 });
// One live payment per idempotency key — this is the database-level guarantee.
paymentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
// A gateway transaction reference must never be reused across gateways.
paymentSchema.index({ gateway: 1, transactionRef: 1 }, { unique: true, sparse: true });
// Cheap lookup when the payer returns and we must reconcile the payment.
paymentSchema.index({ order: 1, method: 1, createdAt: -1 });

export type Payment = InferSchemaType<typeof paymentSchema> & { _id: mongoose.Types.ObjectId };

export const PaymentModel = mongoose.model('Payment', paymentSchema);