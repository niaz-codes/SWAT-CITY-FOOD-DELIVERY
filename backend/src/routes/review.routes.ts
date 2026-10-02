import { Router } from 'express';
import { createReview, deleteReview, listReviewsForTarget, myReviews } from '../controllers/review.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reviewSchema } from '../validations/common';

const router = Router();

router.post('/', requireAuth, validate(reviewSchema), createReview);
router.delete('/:id', requireAuth, deleteReview);
router.get('/my', requireAuth, myReviews);
router.get('/target/:targetType/:targetId', listReviewsForTarget);

export default router;