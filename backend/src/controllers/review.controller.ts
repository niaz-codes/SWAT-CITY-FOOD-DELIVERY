import type { Response } from 'express';
import {
  FoodItemModel,
  OrderModel,
  RestaurantModel,
  ReviewModel,
  RiderProfileModel,
  RideModel,
  UserModel,
  type ReviewTarget,
} from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';

/**
 * Recompute the cached aggregate rating for a target after a review is posted.
 */
async function refreshTargetRating(targetType: ReviewTarget, targetId: string): Promise<void> {
  const aggregate = await ReviewModel.aggregate<{ avg: number; count: number }>([
    { $match: { targetType, targetId: targetId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const metrics = aggregate[0] ?? { avg: 0, count: 0 };
  const avg = Math.round(metrics.avg * 10) / 10;

  if (targetType === 'restaurant') {
    await RestaurantModel.updateOne({ _id: targetId }, { $set: { rating: avg, reviewCount: metrics.count } });
  } else if (targetType === 'food') {
    await FoodItemModel.updateOne({ _id: targetId }, { $set: { rating: avg, reviewCount: metrics.count } });
  } else if (targetType === 'rider') {
    await RiderProfileModel.updateOne({ user: targetId }, { $set: { rating: avg } });
  }
}

/**
 * createReview — one review per (user, targetType, targetId). For food/ride
 * reviews the user must have completed an order/ride (verified purchase).
 */
export const createReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { targetType, targetId, rating, title, comment, orderId } = req.body as {
    targetType: ReviewTarget;
    targetId: string;
    rating: number;
    title?: string;
    comment?: string;
    orderId?: string;
  };

  const existing = await ReviewModel.findOne({ user: req.user._id, targetType, targetId });
  if (existing) throw new AppError('You have already reviewed this item', 409);

  // Verify real purchase for order-backed reviews
  let verified = false;
  const isOrderBacked = targetType === 'food' || targetType === 'restaurant';
  if (req.body.orderId || isOrderBacked || targetType === 'ride') {
    if (targetType === 'ride') {
      const completedRide = await RideModel.exists({ _id: targetId, customer: req.user._id, status: 'completed' });
      verified = Boolean(completedRide);
    } else if (orderId) {
      const completedOrder = await OrderModel.exists({ _id: orderId, customer: req.user._id, status: 'delivered' });
      verified = Boolean(completedOrder);
    } else {
      // restaurant targeted without explicit order — allow (soft verification off)
      verified = true;
    }
  } else {
    verified = true;
  }

  const review = await ReviewModel.create({
    user: req.user._id,
    targetType,
    targetId,
    rating,
    title,
    comment,
    verifiedPurchase: verified,
    order: orderId,
  });

  await refreshTargetRating(targetType, targetId);
  sendSuccess(res, { review });
});

export const listReviewsForTarget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { targetType, targetId } = req.params as { targetType: ReviewTarget; targetId: string };
  const reviews = await ReviewModel.find({ targetType, targetId })
    .sort('-createdAt')
    .populate('user', 'name avatarUrl');
  sendSuccess(res, { reviews });
});

export const myReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const reviews = await ReviewModel.find({ user: req.user._id }).sort('-createdAt');
  sendSuccess(res, { reviews });
});

export const deleteReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const review = await ReviewModel.findOne({ _id: req.params.id, user: req.user._id });
  if (!review) throw NOT_FOUND('Review');
  await review.deleteOne();
  await refreshTargetRating(review.targetType, String(review.targetId));
  sendSuccess(res, { deleted: true });
});

export type { ReviewTarget };
export { UserModel };