import type { Response } from 'express';
import { CartModel, FoodItemModel, RestaurantModel } from '../models';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND } from '../utils/AppError';

async function ensureCart(userId: string) {
  let cart = await CartModel.findOne({ user: userId });
  if (!cart) cart = await CartModel.create({ user: userId, items: [], subtotal: 0 });
  return cart;
}

type CartLine = {
  foodItem: Types.ObjectId;
  name: string;
  price: number;
  emoji?: string;
  gradient?: string[];
  quantity: number;
  note?: string;
};

const sumLines = (lines: Array<{ price: number; quantity: number }>) =>
  lines.reduce((sum, i) => sum + i.price * i.quantity, 0);

/** Swaps the whole cart to a single restaurant (standard single-restaurant basket). */
export const addToCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const { restaurantId, items } = req.body as {
    restaurantId: string;
    items: Array<{ foodItem: string; quantity: number; note?: string }>;
  };

  const restaurant = await RestaurantModel.findById(restaurantId);
  if (!restaurant || restaurant.deletedAt) throw NOT_FOUND('Restaurant');

  const foodIds = items.map((i) => i.foodItem);
  const foods = await FoodItemModel.find({ _id: { $in: foodIds }, available: true, deletedAt: null });
  const foodMap = new Map(foods.map((f) => [String(f._id), f]));
  if (foods.length !== items.length) {
    throw new AppError('One or more items are not available', 422);
  }

  const cart = await ensureCart(req.user._id);
  cart.restaurant = restaurant._id;
  const lines: CartLine[] = items.map((item) => {
    const food = foodMap.get(item.foodItem)!;
    return {
      foodItem: food._id,
      name: food.name,
      price: food.price,
      emoji: food.emoji ?? undefined,
      gradient: food.gradient,
      quantity: item.quantity,
      note: item.note,
    };
  });
  cart.set('items', lines);
  cart.subtotal = sumLines(lines);
  await cart.save();

  sendSuccess(res, { cart });
});

export const getCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const cart = await ensureCart(req.user._id);
  const restaurant = cart.restaurant
    ? await RestaurantModel.findById(cart.restaurant)
        .select('name deliveryFee freeDelivery minOrder deliveryTimeMin emoji gradient')
        .lean()
    : null;
  sendSuccess(res, { cart, restaurant });
});

export const updateCartItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const { foodItem, quantity, note } = req.body as { foodItem: string; quantity: number; note?: string };
  const cart = await ensureCart(req.user._id);
  const line = cart.items.find((i) => String(i.foodItem) === foodItem);
  if (!line) throw NOT_FOUND('Cart item');
  line.quantity = quantity;
  if (note !== undefined) line.note = note;
  cart.subtotal = sumLines(cart.items as unknown as Array<{ price: number; quantity: number }>);
  await cart.save();
  sendSuccess(res, { cart });
});

export const removeFromCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const cart = await ensureCart(req.user._id);
  const before = cart.items.length;
  cart.set(
    'items',
    cart.items.filter((i) => String(i.foodItem) !== req.params.id),
  );
  if (cart.items.length === before) throw NOT_FOUND('Cart item');
  cart.subtotal = sumLines(cart.items as unknown as Array<{ price: number; quantity: number }>);
  if (cart.items.length === 0) cart.restaurant = undefined;
  await cart.save();
  sendSuccess(res, { cart });
});

export const clearCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const cart = await ensureCart(req.user._id);
  cart.set('items', []);
  cart.subtotal = 0;
  cart.restaurant = undefined;
  await cart.save();
  sendSuccess(res, { cart });
});