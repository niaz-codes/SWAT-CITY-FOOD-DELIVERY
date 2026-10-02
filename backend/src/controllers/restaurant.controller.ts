import type { Response } from 'express';
import { FoodCategoryModel, FoodItemModel, RestaurantModel, ReviewModel } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { NOT_FOUND } from '../utils/AppError';
import type { Request } from 'express';
import type { PipelineStage } from 'mongoose';

// ---------------------------------------------------------------------------
// Public catalog (customer-facing)
// ---------------------------------------------------------------------------

export const listRestaurants = asyncHandler(async (req: Request, res: Response) => {
  const { category, search, lat, lng, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));

  const query: Record<string, unknown> = { deletedAt: null };
  if (category && category !== 'All') query.category = category;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { cuisine: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }

  // If a location is provided, use a 2dsphere geospatial sort for distance.
  const latN = Number(lat);
  const lngN = Number(lng);
  if (lat && lng && !Number.isNaN(latN) && !Number.isNaN(lngN)) {
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lngN, latN] },
          distanceField: 'distanceMeters',
          spherical: true,
          query,
        },
      },
      { $sort: { distanceMeters: 1 } },
      { $skip: (p - 1) * l },
      { $limit: l },
    ] as PipelineStage[];
    const [geoResults, total] = await Promise.all([
      RestaurantModel.aggregate<Record<string, unknown> & { distanceMeters?: number }>(pipeline),
      RestaurantModel.countDocuments(query),
    ]);
    sendSuccess(
      res,
      {
        restaurants: geoResults,
        distancesKm: geoResults.map((r) => Math.round(((r.distanceMeters ?? 0) / 1000) * 10) / 10),
      },
      { page: p, limit: l, total },
    );
    return;
  }

  const [restaurants, total] = await Promise.all([
    RestaurantModel.find(query).sort({ featured: -1, rating: -1 }).skip((p - 1) * l).limit(l).lean(),
    RestaurantModel.countDocuments(query),
  ]);
  sendSuccess(res, { restaurants }, { page: p, limit: l, total });
});

export const getRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await RestaurantModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
  if (!restaurant) throw NOT_FOUND('Restaurant');
  const items = await FoodItemModel.find({ restaurant: restaurant._id, available: true, deletedAt: null }).sort({ popular: -1, rating: -1 });
  sendSuccess(res, { restaurant, menu: items });
});

export const listFeaturedRestaurants = asyncHandler(async (_req: Request, res: Response) => {
  const restaurants = await RestaurantModel.find({ featured: true, status: 'open', deletedAt: null }).sort({ rating: -1 }).limit(10);
  sendSuccess(res, { restaurants });
});

export const listFoodCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await FoodCategoryModel.find({ active: true }).sort({ sortOrder: 1 });
  sendSuccess(res, { categories });
});

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  const items = await FoodItemModel.find({ restaurant: req.params.id, available: true, deletedAt: null }).sort('-rating');
  sendSuccess(res, { items });
});

export const getFoodItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await FoodItemModel.findById(req.params.id).populate('restaurant', 'name gradient emoji').lean();
  if (!item || item.deletedAt) throw NOT_FOUND('Food item');
  sendSuccess(res, { item });
});

export const listPopularFood = asyncHandler(async (_req: Request, res: Response) => {
  const items = await FoodItemModel.find({ popular: true, available: true, deletedAt: null }).sort('-rating').limit(12);
  sendSuccess(res, { items });
});

export const searchCatalog = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    sendSuccess(res, { restaurants: [], dishes: [] });
    return;
  }
  const [restaurants, dishes] = await Promise.all([
    RestaurantModel.find({
      deletedAt: null,
      $or: [{ name: { $regex: q, $options: 'i' } }, { cuisine: { $regex: q, $options: 'i' } }, { tags: { $regex: q, $options: 'i' } }],
    })
      .limit(10)
      .lean(),
    FoodItemModel.find({
      available: true,
      deletedAt: null,
      $or: [{ name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }],
    })
      .populate('restaurant', 'name gradient emoji')
      .limit(20)
      .lean(),
  ]);
  sendSuccess(res, { restaurants, dishes });
});

export const getRestaurantReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await ReviewModel.find({ targetType: 'restaurant', targetId: req.params.id })
    .sort('-createdAt')
    .limit(50)
    .populate('user', 'name avatarUrl');
  sendSuccess(res, { reviews });
});