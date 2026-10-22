import { defineModel, type ModelApi } from '../db/model';
import { RiderProfileModel } from './RiderProfile';
import { UserModel } from './User';

export interface RiderDocument {
  _id: string;

  rider: string;
  type: string;
  // Supabase Storage public URL.
  url: string;
  publicId?: string | null;
  status: string;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RiderDocumentModel: ModelApi<RiderDocument> = defineModel<RiderDocument>({
  table: 'rider_documents',
  columns: [
    'rider',
    'type',
    'url',
    'publicId',
    'status',
    'reviewNote',
    'reviewedBy',
    'reviewedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    rider: () => RiderProfileModel,
    reviewedBy: () => UserModel,
  },
});
