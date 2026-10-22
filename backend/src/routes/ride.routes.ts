import { Router } from 'express';
import {
  acceptRideCtrl,
  advanceRideCtrl,
  availableRides,
  cancelRideCtrl,
  createRide,
  estimateRide,
  myRides,
  rideDetail,
  riderCancelRide,
} from '../controllers/ride.controller';
import { requireAuth } from '../middleware/auth';
import { requireCustomer, requireRider } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { cancelRideSchema, estimateRideSchema, requestRideSchema } from '../validations/ride';
import { acceptRideSchema } from '../validations/rider';
import { z } from 'zod';

const router = Router();

// Public-ish estimate (needs auth because fare rules may be scoped)
router.post('/estimate', requireAuth, validate(estimateRideSchema), estimateRide);

// Customer ride booking
router.post('/', requireAuth, requireCustomer, validate(requestRideSchema), createRide);
router.get('/my', requireAuth, requireCustomer, myRides);
// MUST be registered before the /:id segment below.
router.get('/available', requireAuth, requireRider, availableRides);
router.get('/:id', requireAuth, rideDetail);
router.post(
  '/:id/cancel',
  requireAuth,
  requireCustomer,
  validate(cancelRideSchema),
  cancelRideCtrl,
);

// Rider ride operations
router.post('/accept', requireAuth, requireRider, validate(acceptRideSchema), acceptRideCtrl);
router.patch(
  '/:id/status',
  requireAuth,
  requireRider,
  validate(z.object({ status: z.enum(['arriving', 'started', 'completed']) })),
  advanceRideCtrl,
);
router.post(
  '/:id/cancel-rider',
  requireAuth,
  requireRider,
  validate(cancelRideSchema),
  riderCancelRide,
);

export default router;
