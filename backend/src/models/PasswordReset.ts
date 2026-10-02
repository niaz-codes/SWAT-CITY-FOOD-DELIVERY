import mongoose, { type InferSchemaType, Schema } from 'mongoose';

/**
 * A single password-reset request.
 *
 * Security notes:
 *  - Only a SHA-256 HASH of the emailed token is stored. A database leak
 *    therefore cannot be replayed against the reset endpoint.
 *  - `expiresAt` is a TTL index, so MongoDB garbage-collects spent tokens.
 *  - `attempts` is incremented on every failed verification and the record is
 *    burned once it exceeds the configured maximum.
 */
const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** sha256(rawToken) — never the raw token itself. */
    tokenHash: { type: String, required: true, index: true },
    /** What the email was addressed to, kept for auditing. */
    email: { type: String, required: true },

    /** Absolute expiry; drives the TTL index below. */
    expiresAt: { type: Date, required: true },

    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },

    /** Short, non-sensitive code so we can prune old rows without full scans. */
    requestedIp: { type: String, default: '' },
  },
  { timestamps: true },
);

// TTL cleanup: MongoDB removes the document automatically at `expiresAt`.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordResetSchema.index({ user: 1, createdAt: -1 });

export type PasswordReset = InferSchemaType<typeof passwordResetSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PasswordResetModel = mongoose.model('PasswordReset', passwordResetSchema);