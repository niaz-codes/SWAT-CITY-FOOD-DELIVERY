import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const RIDE_TYPES = ['swat_moto', 'swat_city', 'swat_van'] as const;
export type RideType = (typeof RIDE_TYPES)[number];

export const RIDE_STATUSES = ['searching', 'accepted', 'arriving', 'started', 'completed', 'cancelled'] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

const rideSchema = new Schema(
  {
    rideNumber: { type: String, unique: true, sparse: true },

    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    type: { type: String, enum: RIDE_TYPES, required: true },
    vehicle: { type: String, enum: ['bike', 'rickshaw', 'van', 'car'], default: 'bike' },

    status: { type: String, enum: RIDE_STATUSES, default: 'searching', index: true },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: RIDE_STATUSES },
        note: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],

    pickup: {
      address: { type: String, required: true },
      area: { type: String },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    dropoff: {
      address: { type: String, required: true },
      area: { type: String },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    distanceKm: { type: Number, required: true, min: 0 },
    durationMin: { type: Number, default: 0 },

    // Fare computed server-side from base + perKm.
    baseFare: { type: Number, default: 0 },
    distanceFare: { type: Number, default: 0 },
    surgeMultiplier: { type: Number, default: 1 },
    fare: { type: Number, required: true, min: 0 },
    riderPayout: { type: Number, default: 0 },

    paymentMethod: { type: String, enum: ['cash', 'wallet'], default: 'cash' },
    cancelReason: { type: String },
    cancelledBy: { type: String, enum: ['customer', 'rider', 'admin', 'system'] },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ rider: 1, status: 1 });
rideSchema.index({ customer: 1, createdAt: -1 });

export type Ride = InferSchemaType<typeof rideSchema> & { _id: mongoose.Types.ObjectId };

export const RideModel = mongoose.model('Ride', rideSchema);