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

  /**
   * Loyalty program balance. Earned on delivered food orders
   * (settings: `loyalty_points_per_hundred` per Rs 100 of subtotal), redeemed
   * at checkout as a discount (`loyalty_point_value` Rs per point, capped by
   * `loyalty_max_percent` of the subtotal). Debited via compare-and-set in the
   * order service, credited on delivery.
   */
  loyaltyPoints?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CustomerProfileModel = defineModel<CustomerProfile>({
  table: 'customer_profiles',
  columns: ['user', 'name', 'avatarUrl', 'defaultAddress', 'location', 'loyaltyPoints', 'createdAt', 'updatedAt'],
  refs: {
    user: () => UserModel,
    defaultAddress: () => AddressModel,
  },
});
