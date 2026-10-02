import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const TX_TYPES = ['credit', 'debit', 'refund', 'earning', 'commission'] as const;
export type TxType = (typeof TX_TYPES)[number];

const walletTransactionSchema = new Schema(
  {
    wallet: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: TX_TYPES, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },

    // Free-form reference (order id, ride id, ride number, promo code...)
    reference: { type: String },
    referenceModel: { type: String },
    description: { type: String },

    // Audit trail
    byUser: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });

export type WalletTransaction = InferSchemaType<typeof walletTransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WalletTransactionModel = mongoose.model('WalletTransaction', walletTransactionSchema);