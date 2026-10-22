import { Router } from 'express';
import {
  abandonOrderPayment,
  createOrderPayment,
  easypaisaNotify,
  getOrderPayment,
  jazzCashReturn,
  listPaymentMethods,
  renderGatewayHandoff,
  verifyOrderPayment,
} from '../controllers/payment.controller';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { paymentRateLimiter } from '../middleware/rateLimit';
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
// Easypaisa server notification + merchant redirect. POST and GET for tolerance;
// the handler always re-inquires and never trusts the notification payload.
router.get('/easypaisa/notify', easypaisaNotify);
router.post('/easypaisa/notify', easypaisaNotify);

// --- Authenticated customer ---------------------------------------------------
router.use(requireAuth, requireCustomer, paymentRateLimiter);

router.get('/methods', listPaymentMethods);

router.post('/orders/:id/payment', validate(initiatePaymentSchema), createOrderPayment);
router.get('/orders/:id/payment', getOrderPayment);
router.post('/orders/:id/payment/verify', verifyOrderPayment);
router.post('/orders/:id/payment/abandon', abandonOrderPayment);
// There is no `payment/cash` route. Switching an order off a gateway to cash
// would let an unpaid order be treated as payable on delivery, so the only way
// out of a failed payment is a fresh verified gateway payment.

export default router;
