import type { Response } from 'express';
import {
  FoodCategoryModel,
  FoodItemModel,
  OrderModel,
  RestaurantModel,
  UserModel,
  type Order,
  type Restaurant,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED, FORBIDDEN } from '../utils/AppError';
import { paginationMeta, startOfDay } from '../utils/helpers';
import { uploadToCloudinary } from '../services/cloudinary.service';
import { advanceOrderStatus, cancelOrder } from '../services/order.service';
import type { OrderStatus } from '../models/Order';

/**
 * Resolve the signed-in owner's restaurant. Every portal route funnels through
 * here, so an owner can only ever touch data scoped to their own restaurant —
 * there is no endpoint that takes a restaurant id from the request.
 */
async function ownedRestaurant(userId: string): Promise<Restaurant> {
  const restaurant = await RestaurantModel.findOne({ ownerUser: userId, deletedAt: null });
  if (!restaurant) {
    throw NOT_FOUND('Your restaurant has been removed or is not registered yet');
  }
  return restaurant;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const getMyRestaurant = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);

  const today = startOfDay();
  const [owner, pendingOrders, activeOrders, todayOrders, todayRevenue, menuCount] =
    await Promise.all([
      UserModel.findById(req.user._id).select('name email phone avatarUrl verified').lean(),
      OrderModel.countDocuments({ restaurant: restaurant._id, status: 'pending' }),
      OrderModel.countDocuments({
        restaurant: restaurant._id,
        status: { $in: ['confirmed', 'preparing'] },
      }),
      OrderModel.countDocuments({ restaurant: restaurant._id, createdAt: { $gte: today } }),
      OrderModel.find({
        restaurant: restaurant._id,
        status: 'delivered',
        createdAt: { $gte: today },
      })
        .select('total')
        .lean()
        .then((rows) =>
          rows.reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0),
        ),
      FoodItemModel.countDocuments({ restaurant: restaurant._id, deletedAt: null }),
    ]);

  sendSuccess(res, {
    restaurant,
    owner,
    stats: { pendingOrders, activeOrders, todayOrders, todayRevenue, menuCount },
  });
});

const OWNER_FORBIDDEN_FIELDS = [
  // Platform decisions that only an admin may make:
  'featured',
  'rating',
  'reviewCount',
  'isApproved',
  'ownerUser',
  'slug',
  'gradient',
  // Images change only through the upload route:
  'imageUrl',
  'imagePublicId',
  'deletedAt',
  'createdAt',
  'updatedAt',
  '_id',
] as const;

export const updateMyRestaurant = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const body = req.body as Record<string, unknown>;

  // The validation layer whitelists fields; this guard still makes the intent
  // explicit: an owner can never flip platform-managed flags through this route.
  for (const field of OWNER_FORBIDDEN_FIELDS) {
    delete body[field];
  }

  const update: Record<string, unknown> = { ...body };
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    update.location = { type: 'Point', coordinates: [body.lng as number, body.lat as number] };
  }
  delete update.lat;
  delete update.lng;

  const updated = await RestaurantModel.findOneAndUpdate(
    { _id: restaurant._id },
    { $set: update },
    { new: true },
  );
  sendSuccess(res, { restaurant: updated });
});

export const uploadMyImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (!req.file) throw new AppError('Image file is required', 422);
  const restaurant = await ownedRestaurant(req.user._id);
  const uploaded = await uploadToCloudinary(req.file, 'swat-city/restaurants');
  const updated = await RestaurantModel.findOneAndUpdate(
    { _id: restaurant._id },
    { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
    { new: true },
  );
  sendSuccess(res, { restaurant: updated, upload: uploaded });
});

// ---------------------------------------------------------------------------
// Menu (categories are global; items are scoped to the owned restaurant)
// ---------------------------------------------------------------------------

export const getMyMenu = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);

  const [items, categories] = await Promise.all([
    FoodItemModel.find({ restaurant: restaurant._id, deletedAt: null }).sort({ createdAt: -1 }),
    FoodCategoryModel.find({ active: true }).sort({ sortOrder: 1 }),
  ]);
  sendSuccess(res, { restaurant, items, categories });
});

/** Creates a menu item for the owned restaurant only. `restaurantId` is forced. */
export const createMyMenuItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const item = await FoodItemModel.create({
    ...req.body,
    restaurant: restaurant._id,
  });
  sendCreated(res, { item });
});

export const updateMyMenuItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id, restaurant: restaurant._id, deletedAt: null },
    { $set: req.body },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Menu item');
  sendSuccess(res, { item });
});

export const deleteMyMenuItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id, restaurant: restaurant._id, deletedAt: null },
    { $set: { deletedAt: new Date(), available: false } },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Menu item');
  sendSuccess(res, { deleted: true });
});

export const uploadMyMenuItemImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (!req.file) throw new AppError('Image file is required', 422);
  const restaurant = await ownedRestaurant(req.user._id);
  const uploaded = await uploadToCloudinary(req.file, 'swat-city/food');
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id, restaurant: restaurant._id, deletedAt: null },
    { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Menu item');
  sendSuccess(res, { item, upload: uploaded });
});

// ---------------------------------------------------------------------------
// Orders (scoped to the owned restaurant)
// ---------------------------------------------------------------------------

export const listMyOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const { status, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = { restaurant: restaurant._id, deletedAt: null };
  if (status && status !== 'all') query.status = status;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate('rider', 'name phone avatarUrl')
      .lean(),
    OrderModel.countDocuments(query),
  ]);

  sendSuccess(res, { orders }, paginationMeta(p, l, total));
});

export const getMyOrderDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const order = await OrderModel.findOne({
    _id: req.params.id,
    restaurant: restaurant._id,
  })
    .populate('rider', 'name phone avatarUrl')
    .lean();
  if (!order) throw NOT_FOUND('Order');
  // Intentionally NOT populated with the customer user record: the kitchen only
  // needs the delivery address snapshot, never the customer's contact details.
  sendSuccess(res, { order });
});

/**
 * Owner advances an order to `confirmed` (accept), `preparing` (start cooking)
 * or `ready` (packed). Lifecycle validation, the CAS concurrency guard,
 * customer notifications and the rider fan-out all live in `advanceOrderStatus`.
 */
export const advanceMyOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const order = await OrderModel.findOne({
    _id: req.params.id,
    restaurant: restaurant._id,
    deletedAt: null,
  });
  if (!order) throw NOT_FOUND('Order');

  const updated = await advanceOrderStatus(
    String(order._id),
    req.body.status as OrderStatus,
    req.user._id,
    'restaurant',
  );
  sendSuccess(res, { order: updated });
});

/**
 * Owner rejects (pending) or cancels (confirmed/preparing) an order, with the
 * reason that is required and shown to the customer. Deliberately impossible
 * once the order is `ready` or has a rider assigned: at that point, delivery
 * responsibility already exists and cancellation is a dispatch decision.
 */
export const cancelMyOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await ownedRestaurant(req.user._id);
  const order = await OrderModel.findOne({
    _id: req.params.id,
    restaurant: restaurant._id,
    deletedAt: null,
  }) as Order | null;
  if (!order) throw NOT_FOUND('Order');
  if (!['pending', 'confirmed', 'preparing'].includes(order.status)) {
    throw FORBIDDEN('This order can no longer be cancelled by the restaurant');
  }

  const cancelled = await cancelOrder({
    orderId: String(order._id),
    actorId: req.user._id,
    by: 'restaurant',
    reason: req.body.reason as string,
  });
  sendSuccess(res, { order: cancelled });
});
