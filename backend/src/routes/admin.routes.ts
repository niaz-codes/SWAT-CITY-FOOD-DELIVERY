import { Router } from 'express';
import {
  adminAdvanceOrder,
  adminAssignRider,
  adminCancelOrder,
  adminCancelRide,
  adminListOrders,
  adminListPayments,
  adminListRides,
  adminListWalletTransactions,
  adminListWallets,
  adminOrderDetail,
  adminWalletDetail,
  adminListWithdrawals,
  adminWithdrawalDetail,
  adminApproveWithdrawal,
  adminProcessWithdrawal,
  adminRejectWithdrawal,
  adminPayWithdrawal,
} from '../controllers/admin.ops.controller';
import {
  adminCreateFoodItem,
  adminCreateRestaurant,
  adminDeleteFoodItem,
  adminDeleteRestaurant,
  adminListFoodItems,
  adminListRestaurants,
  adminUpdateFoodItem,
  adminUpdateRestaurant,
  adminUploadFoodImage,
  adminUploadRestaurantImage,
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '../controllers/admin.catalog.controller';
import {
  adminCreatePromotion,
  adminDeletePromotion,
  adminGetSettings,
  adminListPromotions,
  adminListTickets,
  adminSetSetting,
  adminTicketDetail,
  adminUpdatePromotion,
  adminUpdateSettingByKey,
  adminUpdateTicket,
} from '../controllers/admin.commerce.controller';
import {
  adminListNotifications,
  adminSendNotification,
} from '../controllers/admin.notification.controller';
import {
  activateRider,
  adminUpdateVehiclePlate,
  adminApproveVehicleChange,
  adminRejectVehicleChange,
  approveRider,
  dashboard,
  listRiders,
  listUsers,
  liveRiders,
  rejectRider,
  reports,
  reviewRider,
  riderDetail,
  suspendRider,
  updateUserStatus,
  uploadRiderAvatar,
} from '../controllers/admin.controller';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import {
  createFoodCategorySchema,
  createFoodItemSchema,
  createRestaurantSchema,
  idParamSchema,
  updateFoodItemSchema,
  updateRestaurantSchema,
} from '../validations/restaurant';
import {
  appSettingSchema,
  adminUpdateVehiclePlateSchema,
  promotionSchema,
  riderReviewSchema,
  supportStatusSchema,
  updatePromotionSchema,
  userStatusSchema,
} from '../validations/admin';
import { ORDER_STATUSES } from '../models';
import { adminSendNotificationSchema } from '../validations/notification';
import { z } from 'zod';

const router = Router();

router.use(requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// Dashboard & reports
// ---------------------------------------------------------------------------
router.get('/dashboard', dashboard);
router.get('/reports', reports);

// ---------------------------------------------------------------------------
// Users & riders
// ---------------------------------------------------------------------------
router.get('/users', listUsers);
router.patch('/users/:id/status', validate(userStatusSchema), updateUserStatus);

router.get('/riders', listRiders);
router.get('/riders/:id', validate(idParamSchema, 'params'), riderDetail);
router.patch('/riders/:id/review', validate(riderReviewSchema), reviewRider);
router.post('/riders/:id/approve', validate(idParamSchema, 'params'), approveRider);
router.post('/riders/:id/reject', validate(idParamSchema, 'params'), rejectRider);
router.post('/riders/:id/suspend', validate(idParamSchema, 'params'), suspendRider);
router.post('/riders/:id/activate', validate(idParamSchema, 'params'), activateRider);

// Admin-only rider photo + bike number. `upload.single('photo')` streams the
// buffer straight to Supabase Storage via the existing uploadFile service.
router.post(
  '/riders/:id/avatar',
  validate(idParamSchema, 'params'),
  upload.single('photo'),
  uploadRiderAvatar,
);
router.patch(
  '/riders/:id/vehicle',
  validate(idParamSchema, 'params'),
  validate(adminUpdateVehiclePlateSchema),
  adminUpdateVehiclePlate,
);
// Rider-proposed vehicle changes require an admin decision before they apply.
router.post(
  '/riders/:id/vehicle/approve',
  validate(idParamSchema, 'params'),
  adminApproveVehicleChange,
);
router.post(
  '/riders/:id/vehicle/reject',
  validate(idParamSchema, 'params'),
  validate(z.object({ reason: z.string().trim().max(200).optional() })),
  adminRejectVehicleChange,
);

// Live map feed: approved riders that have reported a position.
router.get('/riders-live', liveRiders);

// ---------------------------------------------------------------------------
// Restaurants & food & categories
// ---------------------------------------------------------------------------
router.get('/restaurants', adminListRestaurants);
router.post('/restaurants', validate(createRestaurantSchema), adminCreateRestaurant);
router.patch('/restaurants/:id', validate(updateRestaurantSchema), adminUpdateRestaurant);
router.delete('/restaurants/:id', validate(idParamSchema, 'params'), adminDeleteRestaurant);
router.post(
  '/restaurants/:id/upload',
  validate(idParamSchema, 'params'),
  upload.single('file'),
  adminUploadRestaurantImage,
);

router.get('/food', adminListFoodItems);
router.post('/food', validate(createFoodItemSchema), adminCreateFoodItem);
router.patch('/food/:id', validate(updateFoodItemSchema), adminUpdateFoodItem);
router.delete('/food/:id', validate(idParamSchema, 'params'), adminDeleteFoodItem);
router.post(
  '/food/:id/upload',
  validate(idParamSchema, 'params'),
  upload.single('file'),
  adminUploadFoodImage,
);

router.get('/categories', adminListCategories);
router.post('/categories', validate(createFoodCategorySchema), adminCreateCategory);
router.patch('/categories/:id', validate(createFoodCategorySchema.partial()), adminUpdateCategory);
router.delete('/categories/:id', validate(idParamSchema, 'params'), adminDeleteCategory);

// ---------------------------------------------------------------------------
// Orders & rides
// ---------------------------------------------------------------------------
router.get('/orders', adminListOrders);
router.get('/orders/:id', validate(idParamSchema, 'params'), adminOrderDetail);
// An invalid status must be a client-visible 422, not a confusing 409 caught
// deep in the state machine.
router.patch(
  '/orders/:id/status',
  validate(idParamSchema, 'params'),
  validate(z.object({ status: z.enum(ORDER_STATUSES) })),
  adminAdvanceOrder,
);
router.post(
  '/orders/:id/cancel',
  validate(z.object({ reason: z.string().optional() })),
  adminCancelOrder,
);
router.post(
  '/orders/:id/assign-rider',
  validate(z.object({ riderId: z.string() })),
  adminAssignRider,
);

router.get('/rides', adminListRides);
router.post(
  '/rides/:id/cancel',
  validate(z.object({ reason: z.string().optional() })),
  adminCancelRide,
);

// ---------------------------------------------------------------------------
// Payments & wallets
// ---------------------------------------------------------------------------
router.get('/payments', adminListPayments);
router.get('/wallets', adminListWallets);
router.get('/wallets/:id', validate(idParamSchema, 'params'), adminWalletDetail);
router.get('/transactions', adminListWalletTransactions);

// ---------------------------------------------------------------------------
// Withdrawals (rider payouts)
// ---------------------------------------------------------------------------
router.get('/withdrawals', adminListWithdrawals);
router.get('/withdrawals/:id', validate(idParamSchema, 'params'), adminWithdrawalDetail);
router.post('/withdrawals/:id/approve', validate(idParamSchema, 'params'), adminApproveWithdrawal);
router.post('/withdrawals/:id/process', validate(idParamSchema, 'params'), adminProcessWithdrawal);
router.post(
  '/withdrawals/:id/reject',
  validate(idParamSchema, 'params'),
  validate(z.object({ reason: z.string().trim().min(1).max(300) })),
  adminRejectWithdrawal,
);
router.post(
  '/withdrawals/:id/pay',
  validate(idParamSchema, 'params'),
  validate(z.object({ payoutReference: z.string().trim().min(3).max(120) })),
  adminPayWithdrawal,
);

// ---------------------------------------------------------------------------
// Promotions, settings, support
// ---------------------------------------------------------------------------
router.get('/promotions', adminListPromotions);
router.post('/promotions', validate(promotionSchema), adminCreatePromotion);
router.patch('/promotions/:id', validate(updatePromotionSchema), adminUpdatePromotion);
router.delete('/promotions/:id', validate(idParamSchema, 'params'), adminDeletePromotion);

const updateSettingPayloadSchema = appSettingSchema.partial().omit({ key: true });

router.get('/settings', adminGetSettings);
router.post('/settings', validate(appSettingSchema), adminSetSetting);
router.patch('/settings/:key', validate(updateSettingPayloadSchema), adminUpdateSettingByKey);

router.get('/support', adminListTickets);
router.get('/support/:id', validate(idParamSchema, 'params'), adminTicketDetail);
router.patch('/support/:id', validate(supportStatusSchema.partial()), adminUpdateTicket);

// ---------------------------------------------------------------------------
// Broadcast notifications
// ---------------------------------------------------------------------------
router.get('/notifications', adminListNotifications);
router.post('/notifications', validate(adminSendNotificationSchema), adminSendNotification);

export default router;
