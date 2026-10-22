import { defineModel } from '../db/model';

export interface FoodCategory {
  _id: string;

  name: string;
  slug?: string | null;
  emoji?: string | null;
  sortOrder: number;
  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const FoodCategoryModel = defineModel<FoodCategory>({
  table: 'food_categories',
  columns: ['name', 'slug', 'emoji', 'sortOrder', 'active', 'createdAt', 'updatedAt'],
});
