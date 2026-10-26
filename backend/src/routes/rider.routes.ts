import { Router } from 'express';
import {
  acceptOrderJob,
  getRiderProfile,
  myDocuments,
  requestVehicleUpdate,
  riderCancelledJobs,
  riderEarnings,
  riderFeed,
  riderJobs,
  setBaseLocation,
  setOnlineStatus,
  updateDelivery,
  updateRiderProfile,
  uploadDocument,
} from '../controllers/rider.controller';
import { requireAuth, requireRider } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import {
  updateRiderProfileSchema,
  updateVehicleSchema,
  setBaseLocationSchema,
  acceptDeliverySchema,
  completeDeliveryStatusSchema,
  onlineStatusSchema,
} from '../validations/rider';

const router = Router();

router.use(requireAuth, requireRider);

router.get('/profile', getRiderProfile);
router.patch('/profile', validate(updateRiderProfileSchema.partial()), updateRiderProfile);
router.post('/online-status', validate(onlineStatusSchema), setOnlineStatus);

// Vehicle changes are validated for duplicate plates and held for admin review.
router.post('/vehicle', validate(updateVehicleSchema), requestVehicleUpdate);
// Base location is the pin the rider drops on the map.
router.post('/base-location', validate(setBaseLocationSchema), setBaseLocation);

router.post('/documents', upload.single('file'), uploadDocument);
router.get('/documents', myDocuments);

router.get('/feed', riderFeed);
router.get('/jobs', riderJobs);
router.get('/jobs/cancelled', riderCancelledJobs);
router.post('/jobs/accept', validate(acceptDeliverySchema), acceptOrderJob);
router.post('/jobs/delivery', validate(completeDeliveryStatusSchema), updateDelivery);

router.get('/earnings', riderEarnings);

export default router;
