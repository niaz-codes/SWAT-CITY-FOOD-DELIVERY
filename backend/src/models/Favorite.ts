import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const FAVORITE_KINDS = ['restaurant', 'food'] as const;

const favoriteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: FAVORITE_KINDS, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

favoriteSchema.index({ user: 1, kind: 1, refId: 1 }, { unique: true });

export type Favorite = InferSchemaType<typeof favoriteSchema> & { _id: mongoose.Types.ObjectId };

export const FavoriteModel = mongoose.model('Favorite', favoriteSchema);