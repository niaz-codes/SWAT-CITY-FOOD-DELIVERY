import { Router } from 'express';
import {
  getWallet,
  payoutConfig,
  topupWallet,
  walletTransactions,
  withdrawEarnings,
} from '../controllers/wallet.controller';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

router.use(requireAuth);

router.get('/', getWallet);
router.get('/transactions', walletTransactions);
router.get('/payout-config', payoutConfig);
router.post(
  '/topup',
  validate(z.object({ amount: z.number().min(1).max(100000) })),
  topupWallet,
);
router.post(
  '/withdraw',
  validate(z.object({ amount: z.number().min(1) })),
  withdrawEarnings,
);

export default router;