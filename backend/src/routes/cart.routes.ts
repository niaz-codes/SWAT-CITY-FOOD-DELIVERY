import { Router } from 'express';
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCartItem,
} from '../controllers/cart.controller';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { addToCartSchema, updateCartItemSchema } from '../validations/cart';

const router = Router();

router.use(requireAuth, requireCustomer);

router.get('/', getCart);
router.post('/', validate(addToCartSchema), addToCart);
router.patch('/items', validate(updateCartItemSchema), updateCartItem);
router.delete('/items/:id', removeFromCart);
router.delete('/', clearCart);

export default router;
