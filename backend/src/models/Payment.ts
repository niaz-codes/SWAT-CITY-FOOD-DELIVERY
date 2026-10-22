import { defineModel, type ModelApi } from '../db/model';
import { UserModel } from './User';
import { OrderModel } from './Order';
import { RideModel } from './Ride';

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
export interface Payment {
  _id: string;

  user: string;

  // What this payment is for: order | ride | topup | refund
  kind: string;
  order?: string | null;
  ride?: string | null;

  method: string;
  status: string;

  amount: number;
  currency: string;

  /**
   * Client-supplied idempotency key. The unique index is what actually stops a
   * double-tap or a retried request from creating a second payment/order.
   */
  idempotencyKey?: string | null;

  // Required, and deliberately has no `default`. It used to default to 'cash', so
  // any code path that created a Payment without naming a gateway silently
  // produced a "cash" record that no verification could ever confirm.
  // createOrderPayment() is the only writer and always sets it.
  gateway: string;

  /** Reference WE generated and sent to the gateway (its primary lookup key). */
  transactionRef?: string | null;

  /** Reference the gateway handed back: Easypaisa paymentToken / Jazz RRN. */
  gatewayRef?: string | null;

  /** Gateway's own response code, kept verbatim for support/disputes. */
  gatewayResponseCode?: string | null;

  /** Timestamps that make the lifecycle auditable. */
  initiatedAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  refundedAt: Date | null;
  /** When a still-unpaid online payment stops being payable. */
  expiresAt: Date | null;

  /**
   * Number of times we performed a server-side gateway inquiry. Used to bound
   * verification attempts and to detect a gateway that never settles.
   */
  verifyAttempts: number;
  verifiedAt: Date | null;

  failureReason?: string | null;

  /**
   * Sanitised gateway responses. Credentials and SecureHash values are stripped
   * before anything is written here.
   */
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentModel: ModelApi<Payment> = defineModel<Payment>({
  table: 'payments',
  columns: [
    'user',
    'kind',
    'order',
    'ride',
    'method',
    'status',
    'amount',
    'currency',
    'idempotencyKey',
    'gateway',
    'transactionRef',
    'gatewayRef',
    'gatewayResponseCode',
    'initiatedAt',
    'paidAt',
    'failedAt',
    'refundedAt',
    'expiresAt',
    'verifyAttempts',
    'verifiedAt',
    'failureReason',
    'metadata',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
    order: () => OrderModel,
    ride: () => RideModel,
  },
});
