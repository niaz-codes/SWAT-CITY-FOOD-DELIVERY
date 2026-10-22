import { defineModel } from '../db/model';
import { UserModel } from './User';

export interface Address {
  _id: string;

  user: string;
  label?: string | null;
  full: string;
  area?: string | null;
  tag: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const AddressModel = defineModel<Address>({
  table: 'addresses',
  columns: [
    'user',
    'label',
    'full',
    'area',
    'tag',
    'lat',
    'lng',
    'isDefault',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
  },
});
