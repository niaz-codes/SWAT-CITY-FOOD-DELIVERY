import mongoose, { type InferSchemaType, Schema } from 'mongoose';

const foodItemSchema = new Schema(
  {
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String },
    category: { type: String, trim: true, index: true },

    price: { type: Number, required: true, min: 0 },

    emoji: { type: String },
    imageUrl: { type: String },
    imagePublicId: { type: String },
    gradient: { type: [String], default: ['#0E9488', '#0E3F3A'] },

    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    calories: { type: Number },
    prepMin: { type: Number },

    popular: { type: Boolean, default: false },
    available: { type: Boolean, default: true, index: true },
    isVeg: { type: Boolean, default: false },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

foodItemSchema.index({ restaurant: 1, available: 1 });
foodItemSchema.index({ popular: 1, available: 1 });

export type FoodItem = InferSchemaType<typeof foodItemSchema> & { _id: mongoose.Types.ObjectId };

export const FoodItemModel = mongoose.model('FoodItem', foodItemSchema);