import type { Response } from 'express';
import { FoodCategoryModel, FoodItemModel, RestaurantModel, UserModel } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import { paginationMeta } from '../utils/helpers';
import { uploadToCloudinary } from '../services/cloudinary.service';

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

export const adminListRestaurants = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { search, status, approval, page = '1', limit = '20' } = req.query;
  const query: Record<string, unknown> = { deletedAt: null };
  if (status && status !== 'all') query.status = status;
  // `approval=pending` isolates the owner-registrations waiting for review.
  if (approval === 'pending') query.isApproved = false;
  else if (approval === 'approved') query.isApproved = true;
  if (search) query.name = { $regex: String(search), $options: 'i' };
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [restaurants, total] = await Promise.all([
    RestaurantModel.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate('ownerUser', 'name email phone')
      .lean(),
    RestaurantModel.countDocuments(query),
  ]);
  sendSuccess(res, { restaurants }, paginationMeta(p, l, total));
});

export const adminCreateRestaurant = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const body = req.body as Record<string, unknown>;
  const restaurant = await RestaurantModel.create({
    ...body,
    name: body.name as string,
    location:
      typeof body.lat === 'number' && typeof body.lng === 'number'
        ? { type: 'Point', coordinates: [body.lng, body.lat] }
        : undefined,
  });
  sendSuccess(res, { restaurant });
});

export const adminUpdateRestaurant = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = { ...body };
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    update.location = { type: 'Point', coordinates: [body.lng, body.lat] };
    delete update.lat;
    delete update.lng;
  }

  // Attach an owner in the admin panel by email.
  if (typeof body.ownerEmail === 'string' && body.ownerEmail.trim() !== '') {
    const owner = await UserModel.findOne({
      email: String(body.ownerEmail).trim().toLowerCase(),
      role: 'restaurant',
    });
    if (!owner) {
      throw new AppError(
        'No restaurant-owner account exists with that email. The owner must register first.',
        404,
      );
    }
    update.ownerUser = owner._id;
    delete update.ownerEmail;
  }

  const restaurant = await RestaurantModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: update },
    { new: true },
  );
  if (!restaurant) throw NOT_FOUND('Restaurant');
  sendSuccess(res, { restaurant });
});

export const adminDeleteRestaurant = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const restaurant = await RestaurantModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { deletedAt: new Date(), status: 'closed' } },
    { new: true },
  );
  if (!restaurant) throw NOT_FOUND('Restaurant');
  await FoodItemModel.updateMany(
    { restaurant: restaurant._id },
    { $set: { deletedAt: new Date(), available: false } },
  );
  sendSuccess(res, { deleted: true });
});

export const adminUploadRestaurantImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (!req.file) throw new AppError('Image file is required', 422);
  const uploaded = await uploadToCloudinary(req.file, 'swat-city/restaurants');
  const restaurant = await RestaurantModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
    { new: true },
  );
  if (!restaurant) throw NOT_FOUND('Restaurant');
  sendSuccess(res, { restaurant, upload: uploaded });
});

// ---------------------------------------------------------------------------
// Food items
// ---------------------------------------------------------------------------

export const adminListFoodItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { restaurantId, page = '1', limit = '50' } = req.query;
  const query: Record<string, unknown> = { deletedAt: null };
  if (restaurantId) query.restaurant = restaurantId;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 50));
  const [items, total] = await Promise.all([
    FoodItemModel.find(query)
      .populate('restaurant', 'name')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    FoodItemModel.countDocuments(query),
  ]);
  sendSuccess(res, { items }, paginationMeta(p, l, total));
});

export const adminCreateFoodItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { restaurantId, ...data } = req.body as Record<string, unknown>;
  const restaurant = await RestaurantModel.findById(String(restaurantId));
  if (!restaurant) throw NOT_FOUND('Restaurant');
  const item = await FoodItemModel.create({ ...data, restaurant: restaurant._id });
  sendSuccess(res, { item });
});

export const adminUpdateFoodItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: req.body },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Food item');
  sendSuccess(res, { item });
});

export const adminDeleteFoodItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { deletedAt: new Date(), available: false } },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Food item');
  sendSuccess(res, { deleted: true });
});

export const adminUploadFoodImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  if (!req.file) throw new AppError('Image file is required', 422);
  const uploaded = await uploadToCloudinary(req.file, 'swat-city/food');
  const item = await FoodItemModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
    { new: true },
  );
  if (!item) throw NOT_FOUND('Food item');
  sendSuccess(res, { item, upload: uploaded });
});

// ---------------------------------------------------------------------------
// Food categories
// ---------------------------------------------------------------------------

export const adminListCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const categories = await FoodCategoryModel.find().sort({ sortOrder: 1 });
  sendSuccess(res, { categories });
});

export const adminCreateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const category = await FoodCategoryModel.create({
    ...req.body,
    slug: String(req.body.name ?? '')
      .toLowerCase()
      .replace(/\s+/g, '-'),
  });
  sendSuccess(res, { category });
});

export const adminUpdateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const category = await FoodCategoryModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: req.body },
    { new: true },
  );
  if (!category) throw NOT_FOUND('Category');
  sendSuccess(res, { category });
});

export const adminDeleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const category = await FoodCategoryModel.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { active: false } },
    { new: true },
  );
  if (!category) throw NOT_FOUND('Category');
  sendSuccess(res, { deleted: true });
});
