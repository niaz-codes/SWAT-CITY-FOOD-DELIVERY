import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// OrderItem is a standalone lookupable model. Production orders snapshot their
// own order.items, but keeping items indexed by foodItem powers admin analytics.
const orderItemSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem' },
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant', index: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    emoji: { type: String },
    note: { type: String },
  },
  { timestamps: true },
);

orderItemSchema.index({ foodItem: 1, createdAt: -1 });

export type OrderItem = InferSchemaType<typeof orderItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const OrderItemModel = mongoose.model('OrderItem', orderItemSchema);