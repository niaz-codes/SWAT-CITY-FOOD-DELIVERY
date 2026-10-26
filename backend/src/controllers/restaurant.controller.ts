import type { Response } from 'express';
import { FoodCategoryModel, FoodItemModel, RestaurantModel, ReviewModel } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { NOT_FOUND } from '../utils/AppError';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Public catalog (customer-facing)
// ---------------------------------------------------------------------------

export const listRestaurants = asyncHandler(async (req: Request, res: Response) => {
  const { category, search, lat, lng, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));

  const query: Record<string, unknown> = { deletedAt: null, isApproved: true };
  if (category && category !== 'All') query.category = category;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { cuisine: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }

  // If a location is provided, compute distance in JS (no $geoNear).
  const latN = Number(lat);
  const lngN = Number(lng);
  if (lat && lng && !Number.isNaN(latN) && !Number.isNaN(lngN)) {
    const radiusMeters = 100000;
    const filter: any = { ...query, status: 'open', deletedAt: null };
    const all = await RestaurantModel.find(filter).lean();
    const R = 6371000;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const withDist = (all as any[]).map((r) => {
      const loc = r.location;
      if (loc?.coordinates && loc.coordinates.length === 2) {
        const lng0 = loc.coordinates[0];
        const lat0 = loc.coordinates[1];
        const dLat = toRad(latN - lat0);
        const dLng = toRad(lngN - lng0);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat0)) * Math.cos(toRad(latN)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const m = R * c;
        return { ...r, distanceMeters: m, distanceKm: Math.round((m / 1000) * 10) / 10 };
      }
      return {
        ...r,
        distanceMeters: Number.POSITIVE_INFINITY,
        distanceKm: Number.POSITIVE_INFINITY,
      };
    });
    const filtered = withDist
      .filter((x) => x.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    const total = filtered.length;
    const geoResults = filtered.slice((p - 1) * l, (p - 1) * l + l);
    sendSuccess(
      res,
      {
        restaurants: geoResults,
        distancesKm: geoResults.map((r) => r.distanceKm),
      },
      { page: p, limit: l, total },
    );
    return;
  }

  const [restaurants, total] = await Promise.all([
    RestaurantModel.find(query)
      .sort({ featured: -1, rating: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    RestaurantModel.countDocuments(query),
  ]);
  sendSuccess(res, { restaurants }, { page: p, limit: l, total });
});

export const getRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await RestaurantModel.findOne({
    _id: req.params.id,
    deletedAt: null,
    isApproved: true,
  }).lean();
  if (!restaurant) throw NOT_FOUND('Restaurant');
  const items = await FoodItemModel.find({
    restaurant: restaurant._id,
    available: true,
    deletedAt: null,
  }).sort({ popular: -1, rating: -1 });
  sendSuccess(res, { restaurant, menu: items });
});

export const listFeaturedRestaurants = asyncHandler(async (_req: Request, res: Response) => {
  const restaurants = await RestaurantModel.find({
    featured: true,
    status: 'open',
    isApproved: true,
    deletedAt: null,
  })
    .sort({ rating: -1 })
    .limit(10);
  sendSuccess(res, { restaurants });
});

export const listFoodCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await FoodCategoryModel.find({ active: true }).sort({ sortOrder: 1 });
  sendSuccess(res, { categories });
});

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  // Gate on the owning restaurant so menu items of an unapproved (hidden)
  // restaurant cannot be listed by guessing the restaurant id.
  const restaurant = await RestaurantModel.findOne({
    _id: req.params.id,
    deletedAt: null,
    isApproved: true,
  })
    .select('_id')
    .lean();
  if (!restaurant) throw NOT_FOUND('Restaurant');
  const items = await FoodItemModel.find({
    restaurant: restaurant._id,
    available: true,
    deletedAt: null,
  }).sort('-rating');
  sendSuccess(res, { items });
});

export const getFoodItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await FoodItemModel.findById(req.params.id)
    .populate('restaurant', 'name gradient emoji isApproved')
    .lean();
  if (!item || item.deletedAt) throw NOT_FOUND('Food item');
  if ((item.restaurant as unknown as { isApproved?: boolean })?.isApproved === false) {
    throw NOT_FOUND('Food item');
  }
  sendSuccess(res, { item });
});

export const listPopularFood = asyncHandler(async (_req: Request, res: Response) => {
  const items = (await FoodItemModel.find({ popular: true, available: true, deletedAt: null })
    .sort('-rating')
    .limit(12)
    .populate('restaurant', 'isApproved')) as any[];
  // Popular dishes of a hidden restaurant must not leak through this rail.
  const visible = items.filter((i) => (i.restaurant as any)?.isApproved !== false);
  sendSuccess(res, { items: visible });
});

export const searchCatalog = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    sendSuccess(res, { restaurants: [], dishes: [] });
    return;
  }
  const [restaurantRows, dishRows] = await Promise.all([
    RestaurantModel.find({
      deletedAt: null,
      isApproved: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { cuisine: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ],
    })
      .limit(10)
      .lean(),
    FoodItemModel.find({
      available: true,
      deletedAt: null,
      $or: [{ name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }],
    })
      .populate('restaurant', 'name gradient emoji isApproved')
      .limit(20)
      .lean(),
  ]);
  // Dishes belonging to a hidden restaurant stay hidden from search too.
  const restaurants = restaurantRows;
  const dishes = (dishRows as any[]).filter((d) => (d.restaurant as any)?.isApproved !== false);
  sendSuccess(res, { restaurants, dishes });
});

export const getRestaurantReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await ReviewModel.find({ targetType: 'restaurant', targetId: req.params.id })
    .sort('-createdAt')
    .limit(50)
    .populate('user', 'name avatarUrl');
  sendSuccess(res, { reviews });
});
