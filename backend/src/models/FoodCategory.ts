import mongoose, { type InferSchemaType, Schema } from 'mongoose';

const foodCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    emoji: { type: String },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

foodCategorySchema.index({ name: 1 }, { unique: true });

export type FoodCategory = InferSchemaType<typeof foodCategorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FoodCategoryModel = mongoose.model('FoodCategory', foodCategorySchema);