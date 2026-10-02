import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const RESTAURANT_STATUSES = ['closed', 'open', 'busy'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

const restaurantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, unique: true, sparse: true },
    description: { type: String },

    cuisine: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    tags: { type: [String], default: [] },

    status: { type: String, enum: RESTAURANT_STATUSES, default: 'open', index: true },
    featured: { type: Boolean, default: false },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    deliveryTimeMin: { type: Number, default: 30 },
    deliveryFee: { type: Number, default: 0 },
    minOrder: { type: Number, default: 0 },
    deliveryKM: { type: Number, default: 0 },
    freeDelivery: { type: Boolean, default: false },
    promo: { type: String },

    imageUrl: { type: String },
    imagePublicId: { type: String },
    emoji: { type: String },
    gradient: { type: [String], default: ['#0E9488', '#0E3F3A'] },

    // Operational plus marketing contact info
    ownerName: { type: String },
    phone: { type: String },
    addressLine: { type: String },
    area: { type: String, index: true },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },

    hours: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '23:00' },
    },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ status: 1, featured: 1, createdAt: -1 });

export type Restaurant = InferSchemaType<typeof restaurantSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RestaurantModel = mongoose.model('Restaurant', restaurantSchema);