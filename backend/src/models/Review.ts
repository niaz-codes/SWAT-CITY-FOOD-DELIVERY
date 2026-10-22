import { defineModel } from '../db/model';
import { UserModel } from './User';
import { RestaurantModel } from './Restaurant';
import { OrderModel } from './Order';
import { RideModel } from './Ride';

export const REVIEW_TARGETS = ['restaurant', 'food', 'rider', 'ride'] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

export interface Review {
  _id: string;

  user: string;
  targetType: ReviewTarget;
  targetId: string;

  // Only present for food/rider/ride reviews
  restaurant?: string | null;
  order?: string | null;
  ride?: string | null;
  rider?: string | null;

  rating: number;
  title?: string | null;
  comment?: string | null;

  // For order-linked reviews it must be completed/cancelled before reviewing
  verifiedPurchase: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ReviewModel = defineModel<Review>({
  table: 'reviews',
  columns: [
    'user',
    'targetType',
    'targetId',
    'restaurant',
    'order',
    'ride',
    'rider',
    'rating',
    'title',
    'comment',
    'verifiedPurchase',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
    restaurant: () => RestaurantModel,
    order: () => OrderModel,
    ride: () => RideModel,
    rider: () => UserModel,
  },
});
