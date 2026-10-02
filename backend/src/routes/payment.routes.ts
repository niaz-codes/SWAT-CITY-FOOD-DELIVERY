import { Router } from 'express';
import {
  abandonOrderPayment,
  createOrderPayment,
  getOrderPayment,
  jazzCashReturn,
  listPaymentMethods,
  renderGatewayHandoff,
  switchToCashOrder,
  verifyOrderPayment,
} from '../controllers/payment.controller';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { initiatePaymentSchema } from '../validations/payment';

const router = Router();

/**
 * Payment endpoints. Everything under this router requires an authenticated
 * customer EXCEPT the gateway return + handoff pages, which the wallet provider
 * hits from a browser and which carry no auth token.
 */

// --- Public (gateway-driven, no bearer token) ---------------------------------
router.get('/jazzcash/return', jazzCashReturn);
router.get('/handoff/:token', renderGatewayHandoff);

// --- Authenticated customer ---------------------------------------------------
router.use(requireAuth, requireCustomer);

router.get('/methods', listPaymentMethods);

router.post('/orders/:id/payment', validate(initiatePaymentSchema), createOrderPayment);
router.get('/orders/:id/payment', getOrderPayment);
router.post('/orders/:id/payment/verify', verifyOrderPayment);
router.post('/orders/:id/payment/abandon', abandonOrderPayment);
router.post('/orders/:id/payment/cash', switchToCashOrder);

export default router;