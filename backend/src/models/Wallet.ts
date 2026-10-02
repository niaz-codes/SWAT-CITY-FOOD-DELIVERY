import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// One Wallet per user (customer for spending, rider for earnings).
// balance must NEVER be mutated without a matching WalletTransaction.
const walletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    holdsEarnings: { type: Boolean, default: false },
    lastTransactionAt: { type: Date },
  },
  { timestamps: true },
);

export type Wallet = InferSchemaType<typeof walletSchema> & { _id: mongoose.Types.ObjectId };

export const WalletModel = mongoose.model('Wallet', walletSchema);