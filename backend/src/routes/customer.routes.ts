import { Router } from 'express';
import {
  addFavorite,
  createAddress,
  createTicket,
  deleteAddress,
  getActivities,
  getProfile,
  listAddresses,
  listFavorites,
  listTickets,
  removeFavorite,
  replyTicket,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from '../controllers/customer.controller';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAddressSchema, updateProfileSchema } from '../validations/customer';
import { supportReplySchema, supportSchema } from '../validations/common';

const router = Router();

router.use(requireAuth, requireCustomer);

router.get('/profile', getProfile);
router.patch('/profile', validate(updateProfileSchema), updateProfile);

router.get('/addresses', listAddresses);
router.post('/addresses', validate(createAddressSchema), createAddress);
router.patch('/addresses/:id', validate(createAddressSchema.partial()), updateAddress);
router.delete('/addresses/:id', deleteAddress);
router.patch('/addresses/:id/default', setDefaultAddress);

router.get('/favorites', listFavorites);
router.post('/favorites', addFavorite);
router.delete('/favorites/:id', removeFavorite);

router.get('/activities', getActivities);

router.get('/tickets', listTickets);
router.post('/tickets', validate(supportSchema), createTicket);
router.post('/tickets/:id/reply', validate(supportReplySchema), replyTicket);

export default router;