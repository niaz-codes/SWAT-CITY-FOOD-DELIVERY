import { defineModel } from '../db/model';
import { UserModel } from './User';
import { AddressModel } from './Address';

// CustomerProfile extends User with customer-only fields. One per customer user.

export interface CustomerProfileLocation {
  type: string;
  coordinates: number[];
}

export interface CustomerProfile {
  _id: string;

  user: string;
  name: string;
  avatarUrl?: string | null;

  defaultAddress?: string | null;

  // Optional persistent location (used for nearby restaurant ranking)
  location: CustomerProfileLocation;

  createdAt: Date;
  updatedAt: Date;
}

export const CustomerProfileModel = defineModel<CustomerProfile>({
  table: 'customer_profiles',
  columns: ['user', 'name', 'avatarUrl', 'defaultAddress', 'location', 'createdAt', 'updatedAt'],
  refs: {
    user: () => UserModel,
    defaultAddress: () => AddressModel,
  },
});
