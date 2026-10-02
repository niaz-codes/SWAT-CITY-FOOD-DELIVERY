import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const REVIEW_TARGETS = ['restaurant', 'food', 'rider', 'ride'] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

const reviewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REVIEW_TARGETS, required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },

    // Only present for food/rider/ride reviews
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride' },
    rider: { type: Schema.Types.ObjectId, ref: 'User' },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String },
    comment: { type: String, trim: true, maxlength: 1000 },

    // For order-linked reviews it must be completed/cancelled before reviewing
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Prevent duplicate reviews on the same target by the same user.
reviewSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
reviewSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export type Review = InferSchemaType<typeof reviewSchema> & { _id: mongoose.Types.ObjectId };

export const ReviewModel = mongoose.model('Review', reviewSchema);