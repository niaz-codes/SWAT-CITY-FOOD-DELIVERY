import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const RIDER_STATUSES = ['offline', 'online', 'busy'] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const RIDER_APPROVAL = ['pending', 'approved', 'rejected'] as const;
export type RiderApproval = (typeof RIDER_APPROVAL)[number];

const riderProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    name: { type: String, trim: true, required: true },
    avatarUrl: { type: String },

    phone: { type: String, trim: true },
    cnic: { type: String, trim: true },
    // Location data received via Socket.IO is throttle-written here (latest known).
    lastLocation: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
      heading: { type: Number, default: 0 },
      speed: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },

    vehicleType: { type: String, enum: ['bike', 'rickshaw', 'van', 'car'], default: 'bike' },
    vehicleBrand: { type: String, trim: true },
    vehiclePlate: { type: String, trim: true },

    approvalStatus: { type: String, enum: RIDER_APPROVAL, default: 'pending', index: true },
    status: { type: String, enum: RIDER_STATUSES, default: 'offline', index: true },
    isOnline: { type: Boolean, default: false },

    suspendedAt: { type: Date, default: null },

    verificationId: { type: Schema.Types.ObjectId, ref: 'RiderDocument' },

    rating: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
  },
  { timestamps: true },
);

riderProfileSchema.index({ status: 1, approvalStatus: 1 });
riderProfileSchema.index({ 'lastLocation.lat': 1, 'lastLocation.lng': 1 });

export type RiderProfile = InferSchemaType<typeof riderProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RiderProfileModel = mongoose.model('RiderProfile', riderProfileSchema);