import { Router } from 'express';
import {
  acceptOrderJob,
  getRiderProfile,
  myDocuments,
  riderCancelledJobs,
  riderEarnings,
  riderFeed,
  riderJobs,
  setOnlineStatus,
  updateDelivery,
  updateRiderProfile,
  uploadDocument,
} from '../controllers/rider.controller';
import { requireAuth, requireRider } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { updateRiderProfileSchema, acceptDeliverySchema, completeDeliveryStatusSchema } from '../validations/rider';

const router = Router();

router.use(requireAuth, requireRider);

router.get('/profile', getRiderProfile);
router.patch('/profile', validate(updateRiderProfileSchema.partial()), updateRiderProfile);
router.post('/online-status', setOnlineStatus);

router.post('/documents', upload.single('file'), uploadDocument);
router.get('/documents', myDocuments);

router.get('/feed', riderFeed);
router.get('/jobs', riderJobs);
router.get('/jobs/cancelled', riderCancelledJobs);
router.post('/jobs/accept', validate(acceptDeliverySchema), acceptOrderJob);
router.post('/jobs/delivery', validate(completeDeliveryStatusSchema), updateDelivery);

router.get('/earnings', riderEarnings);

export default router;