import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const ADDRESS_TAGS = ['home', 'work', 'other', 'frequent'] as const;

const addressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, maxlength: 60 },
    full: { type: String, required: true, trim: true },
    area: { type: String, trim: true, index: true },
    tag: { type: String, enum: ADDRESS_TAGS, default: 'other' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    isDefault: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

addressSchema.index({ user: 1, isDefault: 1 });

export type Address = InferSchemaType<typeof addressSchema> & { _id: mongoose.Types.ObjectId };

export const AddressModel = mongoose.model('Address', addressSchema);