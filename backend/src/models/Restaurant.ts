import { defineModel } from '../db/model';
import { UserModel } from './User';

export const RESTAURANT_STATUSES = ['closed', 'open', 'busy'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export interface RestaurantLocation {
  type: string;
  coordinates: number[];
}

export interface RestaurantHours {
  open: string;
  close: string;
}

export interface Restaurant {
  _id: string;

  name: string;
  slug?: string | null;
  description?: string | null;

  cuisine?: string | null;
  category?: string | null;
  tags: string[];

  status: RestaurantStatus;
  featured: boolean;

  rating: number;
  reviewCount: number;

  deliveryTimeMin: number;
  deliveryFee: number;
  minOrder: number;
  deliveryKM: number;
  freeDelivery: boolean;
  promo?: string | null;

  imageUrl?: string | null;
  imagePublicId?: string | null;
  emoji?: string | null;
  gradient: string[];

  // Operational plus marketing contact info
  ownerName?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  area?: string | null;

  /**
   * The signed-in restaurant owner (user with role `restaurant`). One owner
   * account manages one restaurant. Created path: an owner self-registers and
   * the restaurant is created with them; admins may also link an owner to an
   * existing restaurant via `ownerEmail`.
   */
  ownerUser?: string | null;

  /**
   * Admin approval. Restaurants created by admins are approved instantly
   * (column default); owner-registered restaurants start unapproved and hidden
   * from the public catalog until an admin approves them.
   */
  isApproved: boolean;

  location: RestaurantLocation;

  hours: RestaurantHours;

  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RestaurantModel = defineModel<Restaurant>({
  table: 'restaurants',
  columns: [
    'name',
    'slug',
    'description',
    'cuisine',
    'category',
    'tags',
    'status',
    'featured',
    'rating',
    'reviewCount',
    'deliveryTimeMin',
    'deliveryFee',
    'minOrder',
    'deliveryKM',
    'freeDelivery',
    'promo',
    'imageUrl',
    'imagePublicId',
    'emoji',
    'gradient',
    'ownerName',
    'phone',
    'addressLine',
    'area',
    'ownerUser',
    'isApproved',
    'location',
    'hours',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  arrayCols: ['tags', 'gradient'],
  refs: {
    ownerUser: () => UserModel,
  },
});
