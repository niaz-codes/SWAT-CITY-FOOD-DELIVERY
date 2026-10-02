import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// CustomerProfile extends User with customer-only fields. One per customer user.
const customerProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    name: { type: String, trim: true, required: true },
    avatarUrl: { type: String },

    defaultAddress: { type: Schema.Types.ObjectId, ref: 'Address' },

    // Optional persistent location (used for nearby restaurant ranking)
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true },
);

customerProfileSchema.index({ location: '2dsphere' });

export type CustomerProfile = InferSchemaType<typeof customerProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomerProfileModel = mongoose.model('CustomerProfile', customerProfileSchema);