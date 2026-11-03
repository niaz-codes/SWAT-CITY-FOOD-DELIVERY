import { Router } from 'express';
import {
  getChatThread,
  getChatUnreadCount,
  getLoyaltyOverview,
  getReferralOverview,
  postChatMessage,
} from '../controllers/engagement.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validations/restaurant';
import { chatMessageSchema, chatListQuerySchema } from '../validations/engagement';

/**
 * Engagement features: per-order chat, loyalty points and referrals.
 *
 * All routes require a signed-in user. Chat participation is derived from the
 * order inside the service (never from the request), so one shared set of
 * routes serves customers, riders and restaurant owners alike.
 */
const router = Router();

router.use(requireAuth);

// Per-order chat threads
router.post(
  '/chat/orders/:id/messages',
  validate(idParamSchema, 'params'),
  validate(chatMessageSchema),
  postChatMessage,
);
router.get(
  '/chat/orders/:id/messages',
  validate(idParamSchema, 'params'),
  validate(chatListQuerySchema, 'query'),
  getChatThread,
);
router.get('/chat/unread-count', getChatUnreadCount);

// Loyalty points (customers)
router.get('/loyalty', getLoyaltyOverview);

// Referral program (customers)
router.get('/referrals', getReferralOverview);

export default router;
