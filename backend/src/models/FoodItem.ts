import { defineModel } from '../db/model';
import { RestaurantModel } from './Restaurant';

export interface FoodItem {
  _id: string;

  restaurant: string;
  name: string;
  description?: string | null;
  category?: string | null;

  price: number;

  emoji?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  gradient: string[];

  rating: number;
  reviewCount: number;
  calories?: number | null;
  prepMin?: number | null;

  popular: boolean;
  available: boolean;
  isVeg: boolean;

  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const FoodItemModel = defineModel<FoodItem>({
  table: 'food_items',
  columns: [
    'restaurant',
    'name',
    'description',
    'category',
    'price',
    'emoji',
    'imageUrl',
    'imagePublicId',
    'gradient',
    'rating',
    'reviewCount',
    'calories',
    'prepMin',
    'popular',
    'available',
    'isVeg',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  arrayCols: ['gradient'],
  refs: {
    restaurant: () => RestaurantModel,
  },
});
