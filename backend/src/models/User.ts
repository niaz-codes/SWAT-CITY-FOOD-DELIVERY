import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const USER_ROLES = ['customer', 'rider', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },

    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },

    // Intentionally never returned by the API — password hash only.
    password: { type: String, select: false },

    verified: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    pendingApproval: { type: Boolean, default: false },

    avatarUrl: { type: String },
    deviceTokens: { type: [String], default: [] },

    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

userSchema.index({ createdAt: 1 });

export type User = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

export const UserModel = mongoose.model('User', userSchema);