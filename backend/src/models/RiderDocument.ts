import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const DOC_TYPES = ['cnic_front', 'cnic_back', 'license', 'vehicle_reg'] as const;

const riderDocumentSchema = new Schema(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'RiderProfile', required: true, index: true },
    type: { type: String, enum: DOC_TYPES, required: true },
    // Cloudinary public URL (not the API secret / raw URL).
    url: { type: String, required: true },
    publicId: { type: String },
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    reviewNote: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

riderDocumentSchema.index({ rider: 1, type: 1 });

export type RiderDocument = InferSchemaType<typeof riderDocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RiderDocumentModel = mongoose.model('RiderDocument', riderDocumentSchema);