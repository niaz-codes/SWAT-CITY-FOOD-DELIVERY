import mongoose, { type InferSchemaType, Schema } from 'mongoose';

// Key/value app-wide settings edited from the admin panel.
const appSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    label: { type: String },
    description: { type: String },
  },
  { timestamps: true },
);

export type AppSetting = InferSchemaType<typeof appSettingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AppSettingModel = mongoose.model('AppSetting', appSettingSchema);