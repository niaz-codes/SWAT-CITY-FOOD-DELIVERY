import { Router } from 'express';
import {
  cancelOrderCtrl,
  createOrder,
  myOrders,
  orderDetail,
  quoteOrder,
  trackOrder,
} from '../controllers/order.controller';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { cancelOrderSchema, placeOrderSchema } from '../validations/order';

const router = Router();

router.use(requireAuth, requireCustomer);

router.post('/', validate(placeOrderSchema), createOrder);
router.get('/', myOrders);
// Registered before `/:id` so "quote" is not parsed as an order id.
router.get('/quote', quoteOrder);
router.get('/:id', orderDetail);
router.get('/:id/track', trackOrder);
router.post('/:id/cancel', validate(cancelOrderSchema), cancelOrderCtrl);

export default router;
