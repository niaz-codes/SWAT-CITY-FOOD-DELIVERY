import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, BAD_REQUEST } from '../utils/AppError';
import {
  TRANSFER_CHANNELS,
  TRANSFERS_ENABLED_KEY,
  getPaymentMethodConfig,
  listPaymentMethodConfigs,
  savePaymentMethodConfig,
  setTransfersEnabled,
  transfersEnabled,
  type TransferChannel,
} from '../services/paymentSettings.service';

/** GET /admin/payment-methods — the transfer accounts the admin manages. */
export const adminGetPaymentMethods = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [methods, master] = await Promise.all([
    listPaymentMethodConfigs(),
    transfersEnabled(),
  ]);
  sendSuccess(res, { methods, transfersEnabled: master });
});

/**
 * PUT /admin/payment-methods/:channel — save the receiving account for one
 * channel. Values persist in app_settings and are LIVE for new orders; the
 * next checkout reads exactly these numbers from the database.
 */
export const adminUpdatePaymentMethod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const channel = String(req.params.channel ?? '') as TransferChannel;
  if (!TRANSFER_CHANNELS.includes(channel)) {
    throw new AppError('Unknown payment channel', 404);
  }

  const body = (req.body ?? {}) as {
    enabled?: unknown;
    accountTitle?: unknown;
    accountNumber?: unknown;
    bankName?: unknown;
    iban?: unknown;
    branch?: unknown;
  };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;

  if (typeof body.enabled !== 'boolean') {
    throw BAD_REQUEST('The enabled switch is required');
  }
  const enabled = body.enabled;

  const config = await savePaymentMethodConfig(channel, {
    enabled,
    accountTitle: str(body.accountTitle),
    accountNumber: str(body.accountNumber),
    bankName: str(body.bankName),
    iban: str(body.iban),
    branch: str(body.branch),
  });

  // Sanity: never hand back a config that would render an unusable method.
  // (savePaymentMethodConfig already validates when enabled — defence in depth.)
  if (enabled && (!config.accountNumber || !config.accountTitle)) {
    throw BAD_REQUEST('Account details are incomplete');
  }

  const { source } = await getPaymentMethodConfig(channel);
  sendSuccess(res, { channel, config, source });
});

/**
 * PUT /admin/payment-methods/master — the whole manual-transfer flow on/off.
 * While OFF: checkout cannot offer transfers, instructions endpoints answer
 * 422 and every order stays waiting instead of moving money.
 */
export const adminUpdateTransfersMaster = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') throw BAD_REQUEST('The enabled switch is required');
  await setTransfersEnabled(body.enabled);
  sendSuccess(res, { key: TRANSFERS_ENABLED_KEY, transfersEnabled: body.enabled });
});
