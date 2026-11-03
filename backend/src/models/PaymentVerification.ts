import { defineModel, type ModelApi } from '../db/model';
import { UserModel } from './User';
import { OrderModel } from './Order';
import { PaymentModel } from './Payment';

/**
 * Audit log for the manual bank/wallet transfer workflow.
 *
 * Every step of the manual-transfer lifecycle writes one immutable row here:
 *   receipt_submitted  the customer submitted a reference + receipt screenshot
 *   approve            the admin checked the UBL statement and CONFIRMED the
 *                      transfer (this — never the screenshot itself — is the
 *                      event that makes a payment `paid`)
 *   reject             the admin compared the submission with the bank account
 *                      and it did not match, with the reason stored
 *   request_info       the admin needs a clearer receipt / more details
 *
 * The admin's user id, the timestamp and the reason are kept even when the
 * free-text fields are edited later — this table is never updated or deleted.
 */
export interface PaymentVerification {
  _id: string;

  payment: string;
  order?: string | null;

  /** Admin or customer who performed the action. */
  actor: string;

  /** 'admin' for verification decisions, 'customer' for submissions. */
  actorRole: string;

  decision: string;
  reason?: string | null;

  /** Money + reference snapshot, so the log stays readable on its own. */
  amount?: number | null;
  transactionRef?: string | null;

  createdAt: Date;
}

export const PAYMENT_VERIFICATION_DECISIONS = [
  'receipt_submitted',
  'approve',
  'reject',
  'request_info',
] as const;

export const PaymentVerificationModel: ModelApi<PaymentVerification> = defineModel<PaymentVerification>({
  table: 'payment_verifications',
  columns: [
    'payment',
    'order',
    'actor',
    'actorRole',
    'decision',
    'reason',
    'amount',
    'transactionRef',
    'createdAt',
  ],
  refs: {
    payment: () => PaymentModel,
    order: () => OrderModel,
    actor: () => UserModel,
  },
});
