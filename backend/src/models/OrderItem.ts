import { defineModel } from '../db/model';
import { OrderModel } from './Order';
import { FoodItemModel } from './FoodItem';
import { RestaurantModel } from './Restaurant';

// OrderItem is a standalone lookupable model. Production orders snapshot their
// own order.items, but keeping items indexed by foodItem powers admin analytics.

export interface OrderItem {
  _id: string;

  order: string;
  foodItem?: string | null;
  restaurant?: string | null;

  name: string;
  quantity: number;
  price: number;
  emoji?: string | null;
  note?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderItemModel = defineModel<OrderItem>({
  table: 'order_items',
  columns: [
    'order',
    'foodItem',
    'restaurant',
    'name',
    'quantity',
    'price',
    'emoji',
    'note',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    order: () => OrderModel,
    foodItem: () => FoodItemModel,
    restaurant: () => RestaurantModel,
  },
});
