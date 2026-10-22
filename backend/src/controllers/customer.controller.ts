import type { Response } from 'express';
import {
  AddressModel,
  CustomerProfileModel,
  FavoriteModel,
  FoodItemModel,
  OrderModel,
  OrderItemModel,
  RestaurantModel,
  ReviewModel,
  RideModel,
  WalletTransactionModel,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND } from '../utils/AppError';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user) throw new AppError('Not authorized', 401);
  const [profile, addresses] = await Promise.all([
    CustomerProfileModel.findOne({ user: user._id }).lean(),
    AddressModel.find({ user: user._id, deletedAt: null })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean(),
  ]);
  sendSuccess(res, { profile: profile ?? null, addresses });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user) throw new AppError('Not authorized', 401);
  const patch = req.body as { name?: string; email?: string; avatarUrl?: string };

  const updatedProfile = await CustomerProfileModel.findOneAndUpdate(
    { user: user._id },
    { $set: { name: patch.name, avatarUrl: patch.avatarUrl } },
    { new: true, upsert: true },
  );
  const updatedUser = await CustomerProfileModel.updateOne({ user: user._id }, {}).exec();
  void updatedUser;

  // Mirrors updates to the shared User record.
  const { UserModel } = await import('../models');
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { name: patch.name, email: patch.email, avatarUrl: patch.avatarUrl } },
  );

  sendSuccess(res, { profile: updatedProfile });
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const listAddresses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const addresses = await AddressModel.find({ user: req.user._id, deletedAt: null }).sort(
    '-createdAt',
  );
  sendSuccess(res, { addresses });
});

export const createAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const body = req.body as {
    label?: string;
    full: string;
    area?: string;
    tag?: 'home' | 'work' | 'other' | 'frequent';
    lat: number;
    lng: number;
    isDefault?: boolean;
  };
  if (body.isDefault) {
    await AddressModel.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
  }
  const address = await AddressModel.create({
    user: req.user._id,
    label: body.label,
    full: body.full,
    area: body.area,
    tag: body.tag ?? 'other',
    lat: body.lat,
    lng: body.lng,
    isDefault: body.isDefault ?? false,
  });
  sendSuccess(res, { address });
});

export const updateAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const address = await AddressModel.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: req.body },
    { new: true },
  );
  if (!address) throw NOT_FOUND('Address');
  sendSuccess(res, { address });
});

export const deleteAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const address = await AddressModel.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { deletedAt: new Date() } },
    { new: true },
  );
  if (!address) throw NOT_FOUND('Address');
  sendSuccess(res, { deleted: true });
});

export const setDefaultAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  await AddressModel.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
  const address = await AddressModel.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { isDefault: true } },
    { new: true },
  );
  if (!address) throw NOT_FOUND('Address');
  sendSuccess(res, { address });
});

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export const listFavorites = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const favorites = await FavoriteModel.find({ user: req.user._id }).sort('-createdAt').lean();

  const restaurantIds = favorites.filter((f) => f.kind === 'restaurant').map((f) => f.refId);
  const foodIds = favorites.filter((f) => f.kind === 'food').map((f) => f.refId);

  const [restaurants, foods] = await Promise.all([
    RestaurantModel.find({ _id: { $in: restaurantIds } }).lean(),
    FoodItemModel.find({ _id: { $in: foodIds } })
      .populate('restaurant', 'name gradient emoji')
      .lean(),
  ]);

  const restMap = new Map(restaurants.map((r) => [String(r._id), r]));
  const foodMap = new Map(foods.map((f) => [String(f._id), f]));

  const result = favorites.map((fav) => {
    if (fav.kind === 'restaurant') {
      const r = restMap.get(String(fav.refId));
      return r
        ? {
            id: String(fav._id),
            kind: fav.kind,
            refId: String(fav.refId),
            name: r.name,
            subtitle: r.cuisine,
            rating: r.rating,
            gradient: r.gradient,
            emoji: r.emoji,
            savedAt: fav.createdAt,
          }
        : null;
    }
    const f = foodMap.get(String(fav.refId));
    if (!f) return null;
    const restaurant = f.restaurant as unknown as
      { name?: string; gradient?: string[]; emoji?: string } | undefined;
    return {
      id: String(fav._id),
      kind: fav.kind,
      refId: String(fav.refId),
      name: f.name,
      subtitle: restaurant?.name ?? '',
      rating: f.rating,
      price: f.price,
      gradient: f.gradient,
      emoji: f.emoji,
      savedAt: fav.createdAt,
    };
  });

  sendSuccess(res, { favorites: result.filter(Boolean) });
});

export const addFavorite = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const body = req.body as {
    kind?: 'restaurant' | 'food';
    refId?: string;
    foodId?: string;
    restaurantId?: string;
  };
  let kind: 'restaurant' | 'food';
  let refId: string;
  if (body.foodId) {
    kind = 'food';
    refId = body.foodId;
  } else if (body.restaurantId) {
    kind = 'restaurant';
    refId = body.restaurantId;
  } else {
    kind = body.kind ?? 'food';
    refId = body.refId ?? '';
  }
  if (!refId) throw new AppError('A foodId or refId is required', 422);
  const exists = await FavoriteModel.findOne({ user: req.user._id, kind, refId });
  if (exists) {
    sendSuccess(res, { favorite: exists, alreadyExisted: true });
    return;
  }
  const favorite = await FavoriteModel.create({ user: req.user._id, kind, refId });
  sendSuccess(res, { favorite, alreadyExisted: false });
});

export const removeFavorite = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  await FavoriteModel.deleteOne({ user: req.user._id, refId: req.params.id });
  sendSuccess(res, { removed: true });
});

// ---------------------------------------------------------------------------
// Feed / activities (union of orders, rides and wallet movements)
// ---------------------------------------------------------------------------

export const getActivities = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const userId = req.user._id;

  const [orders, rides, txs] = await Promise.all([
    OrderModel.find({ customer: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('restaurant', 'name emoji gradient')
      .lean(),
    RideModel.find({ customer: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    WalletTransactionModel.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  const activities = [
    ...orders.map((o) => {
      const restaurant = o.restaurant as unknown as { name?: string; emoji?: string } | undefined;
      return {
        id: `o_${String(o._id)}`,
        kind: 'food',
        title: restaurant?.name ?? 'Food order',
        subtitle: `Order #${o.orderNumber} · ${o.status}`,
        amount: o.total,
        at: o.createdAt,
        status: o.status,
      };
    }),
    ...rides.map((r) => ({
      id: `r_${String(r._id)}`,
      kind: 'ride',
      title: 'Swat City Food Delivery Ride',
      subtitle: `${r.pickup?.address ?? 'Pickup'} → ${r.dropoff?.address ?? 'Dropoff'} · ${r.status}`,
      amount: r.fare,
      at: r.createdAt,
      status: r.status,
    })),
    ...txs.map((t) => ({
      id: `w_${String(t._id)}`,
      kind: 'payment',
      title:
        t.type === 'credit' || t.type === 'refund' || t.type === 'earning'
          ? 'Wallet credit'
          : 'Wallet debit',
      subtitle: t.description ?? t.type,
      amount: t.amount,
      at: t.createdAt,
      status: t.type,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  sendSuccess(res, { activities });
});

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export const createTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const { SupportTicketModel } = await import('../models');
  const { subject, description, category } = req.body as {
    subject: string;
    description: string;
    category?: string;
  };
  const ticket = await SupportTicketModel.create({
    user: req.user._id,
    subject,
    description,
    category: category ?? 'general',
    messages: [{ from: req.user._id, text: description }],
  });
  sendSuccess(res, { ticket });
});

export const listTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const { SupportTicketModel } = await import('../models');
  const { status } = req.query;
  const query: Record<string, unknown> = { user: req.user._id };
  if (status) query.status = status;
  const tickets = await SupportTicketModel.find(query).sort('-updatedAt');
  sendSuccess(res, { tickets });
});

export const replyTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const { SupportTicketModel } = await import('../models');
  const ticket = await SupportTicketModel.findOne({ _id: req.params.id, user: req.user._id });
  if (!ticket) throw NOT_FOUND('Ticket');
  ticket.messages.push({ from: req.user._id, text: req.body.text });
  if (ticket.status === 'closed') ticket.status = 'open';
  await ticket.save();
  sendSuccess(res, { ticket });
});

// ---------------------------------------------------------------------------
// Reviews visible to customer screens + order-linked verification
// ---------------------------------------------------------------------------

export const myReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const reviews = await ReviewModel.find({ user: req.user._id }).sort('-createdAt');
  sendSuccess(res, { reviews });
});

export const topOrderItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Not authorized', 401);
  const items = await OrderItemModel.find({
    order: { $in: await OrderModel.find({ customer: req.user._id }).select('_id').lean() },
  })
    .sort('-quantity')
    .limit(10)
    .lean();
  sendSuccess(res, { items });
});
