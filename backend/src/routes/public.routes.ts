import { Router } from 'express';
import {
  getFoodItem,
  getMenu,
  getRestaurant,
  getRestaurantReviews,
  listFeaturedRestaurants,
  listFoodCategories,
  listPopularFood,
  listRestaurants,
  searchCatalog,
} from '../controllers/restaurant.controller';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validations/restaurant';

const router = Router();

router.get('/restaurants', listRestaurants);
router.get('/restaurants/featured', listFeaturedRestaurants);
router.get('/restaurants/popular', listPopularFood);
router.get('/restaurants/search', searchCatalog);
router.get('/restaurants/categories', listFoodCategories);
router.get('/restaurants/:id', validate(idParamSchema, 'params'), getRestaurant);
router.get('/restaurants/:id/menu', validate(idParamSchema, 'params'), getMenu);
router.get('/restaurants/:id/reviews', validate(idParamSchema, 'params'), getRestaurantReviews);

router.get('/food/:id', validate(idParamSchema, 'params'), getFoodItem);

export default router;