import { Router } from 'express';
import { searchPlaces } from '../controllers/places.controller';

const router = Router();

// Public: address-picker suggestions. No auth, no provider keys.
router.get('/search', searchPlaces);

export default router;
