import { defineModel } from '../db/model';
import { UserModel } from './User';
import { RestaurantModel } from './Restaurant';

// One Cart document per customer. Items array is the active basket.
// CartItem docs are embedded here (they are not a standalone model).

/** Embedded cart line — no `_id`, snapshots the item at add-to-cart time. */
export interface CartItem {
  foodItem: string;
  name: string;
  price: number;
  emoji?: string | null;
  gradient: string[];
  quantity: number;
  note?: string | null;
}

export interface Cart {
  _id: string;

  user: string;
  restaurant?: string | null;
  items: CartItem[];

  // Server-side computed total (subtotal only; fees applied at order time).
  subtotal: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CartModel = defineModel<Cart>({
  table: 'carts',
  columns: ['user', 'restaurant', 'items', 'subtotal', 'createdAt', 'updatedAt'],
  refs: {
    user: () => UserModel,
    restaurant: () => RestaurantModel,
  },
});
