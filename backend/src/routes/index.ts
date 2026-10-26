import { Router } from 'express';
import authRoutes from './auth.routes';
import customerRoutes from './customer.routes';
import publicRoutes from './public.routes';
import cartRoutes from './cart.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';
import riderRoutes from './rider.routes';
import restaurantPortalRoutes from './restaurantPortal.routes';
import rideRoutes from './ride.routes';
import walletRoutes from './wallet.routes';
import notificationRoutes from './notification.routes';
import reviewRoutes from './review.routes';
import placesRoutes from './places.routes';
import adminRoutes from './admin.routes';
import { isProduction } from '../config/env';

const router = Router();

router.use('/auth', authRoutes);
router.use('/customer', customerRoutes);
router.use('/', publicRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/rider', riderRoutes);
router.use('/restaurant', restaurantPortalRoutes);
router.use('/rides', rideRoutes);
router.use('/wallet', walletRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/places', placesRoutes);
router.use('/admin', adminRoutes);

// A lightweight aggregated status used by mobile health dashboards.
router.get('/status', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'swat-city-backend',
      environment: isProduction ? 'production' : 'development',
    },
  });
});

export default router;
