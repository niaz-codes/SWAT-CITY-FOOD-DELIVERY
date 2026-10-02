import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// One Cart document per customer. Items array is the active basket.
// CartItem docs are embedded here (they are not a standalone model).
const cartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
    items: [
      {
        _id: false,
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        emoji: { type: String },
        gradient: { type: [String], default: ['#0E9488', '#0E3F3A'] },
        quantity: { type: Number, required: true, min: 1 },
        note: { type: String },
      },
    ],
    // Server-side computed total (subtotal only; fees applied at order time).
    subtotal: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type Cart = InferSchemaType<typeof cartSchema> & { _id: mongoose.Types.ObjectId };

export const CartModel = mongoose.model('Cart', cartSchema);