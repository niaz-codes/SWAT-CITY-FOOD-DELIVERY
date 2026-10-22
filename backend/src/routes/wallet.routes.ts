import { Router } from 'express';
import {
  getWallet,
  payoutConfig,
  riderCashIn,
  transferWalletCtrl,
  walletTransactions,
  createTopup,
  verifyTopup,
  topupStatus,
  requestWithdrawalCtrl,
  riderWithdrawalsList,
  riderCancelWithdrawal,
} from '../controllers/wallet.controller';
import { requireAuth, requireRider } from '../middleware/auth';
import { walletMutationRateLimiter } from '../middleware/rateLimit';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

router.use(requireAuth);

router.get('/', getWallet);
router.get('/transactions', walletTransactions);
router.get('/payout-config', payoutConfig);

// Wallet top-up via a real gateway debit. The wallet is credited ONLY after the
// gateway confirms the Easypaisa MA debit; `idempotencyKey` (unique-indexed on
// the Payment row) keeps a retry from opening a second charge.
router.post(
  '/topup',
  walletMutationRateLimiter,
  validate(
    z.object({
      amount: z.number().min(1),
      customerPhone: z.string().trim().max(20).optional(),
      idempotencyKey: z.string().trim().min(8).max(120).optional(),
    }),
  ),
  createTopup,
);
router.post(
  '/topup/verify',
  walletMutationRateLimiter,
  validate(z.object({ paymentId: z.string().optional() })),
  verifyTopup,
);
router.get('/topup/status', topupStatus);

// Rider cash-out. Money is reserved at request time and paid out by an admin
// only after approval; rejected/cancelled requests are released automatically.
router.post(
  '/withdraw',
  requireRider,
  walletMutationRateLimiter,
  validate(
    z.object({
      amount: z.number().min(1),
      destinationType: z.enum(['easypaisa', 'bank']),
      destination: z.string().trim().min(4).max(40),
      destinationHolder: z.string().trim().min(2).max(80),
      note: z.string().trim().max(300).optional(),
    }),
  ),
  requestWithdrawalCtrl,
);
router.get('/withdrawals', requireRider, riderWithdrawalsList);
router.post(
  '/withdrawals/:id/cancel',
  requireRider,
  walletMutationRateLimiter,
  validate(z.object({ id: z.string() }), 'params'),
  riderCancelWithdrawal,
);

// Wallet-to-wallet transfer. Recipient is found by phone; amount must be at
// least PKR 1. Auth-only (both customers and riders can move their own balance).
router.post(
  '/transfer',
  walletMutationRateLimiter,
  validate(
    z.object({
      phone: z.string().trim().min(10).max(20),
      amount: z.number().min(1),
      note: z.string().trim().max(200).optional(),
    }),
  ),
  transferWalletCtrl,
);

// Rider cash deposit: logs COD cash collected on deliveries into the rider's
// own earnings wallet. Rider-only; the controller double-checks the role and
// caps the amount at the rider's un-deposited COD collections (server-side).
router.post(
  '/cash-in',
  requireRider,
  walletMutationRateLimiter,
  validate(z.object({ amount: z.number().min(1).max(1_000_000) })),
  riderCashIn,
);

export default router;
