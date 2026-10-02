import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const PROMO_TYPES = ['percent', 'flat'] as const;

const promotionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },

    type: { type: String, enum: PROMO_TYPES, default: 'percent' },
    value: { type: Number, required: true, min: 0 }, // e.g. 15 (percent) or 150 (flat)
    maxDiscount: { type: Number },
    minOrder: { type: Number, default: 0 },

    // audience targeting
    audience: {
      type: { type: String, enum: ['all', 'new_customers', 'specific_users', 'specific_riders'], default: 'all' },
      userIds: { type: [Schema.Types.ObjectId], default: [] },
    },

    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    maxUses: { type: Number },
    usedCount: { type: Number, default: 0 },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type Promotion = InferSchemaType<typeof promotionSchema> & { _id: mongoose.Types.ObjectId };

export const PromotionModel = mongoose.model('Promotion', promotionSchema);