import { Router } from 'express';
import {
  advanceMyOrder,
  cancelMyOrder,
  createMyMenuItem,
  deleteMyMenuItem,
  getMyMenu,
  getMyOrderDetail,
  getMyRestaurant,
  listMyOrders,
  updateMyMenuItem,
  updateMyRestaurant,
  uploadMyImage,
  uploadMyMenuItemImage,
} from '../controllers/restaurantPortal.controller';
import { requireAuth, requireRestaurant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { idParamSchema } from '../validations/restaurant';
import {
  restaurantCancelOrderSchema,
  restaurantAdvanceOrderSchema,
  restaurantMenuItemCreateSchema,
  restaurantProfileUpdateSchema,
} from '../validations/restaurant';
import { updateFoodItemSchema } from '../validations/restaurant';

/**
 * Restaurant owner portal (role `restaurant`).
 *
 * Every route is scoped through `ownedRestaurant(req.user._id)` inside the
 * controller — no endpoint accepts a restaurant id, so an owner always operates
 * exclusively on their own restaurant. Menu items, orders and the profile are
 * therefore structurally unreachable for any other restaurant.
 */
const router = Router();

router.use(requireAuth, requireRestaurant);

// Profile
router.get('/me', getMyRestaurant);
router.patch('/me', validate(restaurantProfileUpdateSchema), updateMyRestaurant);
router.post('/me/upload', upload.single('file'), uploadMyImage);

// Menu
router.get('/menu', getMyMenu);
router.post('/menu', validate(restaurantMenuItemCreateSchema), createMyMenuItem);
router.patch('/menu/:id', validate(idParamSchema, 'params'), validate(updateFoodItemSchema), updateMyMenuItem);
router.delete('/menu/:id', validate(idParamSchema, 'params'), deleteMyMenuItem);
router.post(
  '/menu/:id/upload',
  validate(idParamSchema, 'params'),
  upload.single('file'),
  uploadMyMenuItemImage,
);

// Orders
router.get('/orders', listMyOrders);
router.get('/orders/:id', validate(idParamSchema, 'params'), getMyOrderDetail);
router.post(
  '/orders/:id/advance',
  validate(idParamSchema, 'params'),
  validate(restaurantAdvanceOrderSchema),
  advanceMyOrder,
);
router.post(
  '/orders/:id/cancel',
  validate(idParamSchema, 'params'),
  validate(restaurantCancelOrderSchema),
  cancelMyOrder,
);

export default router;
