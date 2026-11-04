import { env, manualPaymentsEnabled } from '../config/env';
import { AppSettingModel } from '../models';
import { AppError, BAD_REQUEST, NOT_FOUND } from '../utils/AppError';
import { getSetting, setSetting } from './settings.service';

/**
 * PAYMENT METHOD SETTINGS — the receiving accounts customers transfer into,
 * stored in the database and edited from the admin panel (Finance → Payment
 * Methods) WITHOUT touching code or redeploying.
 *
 * Layering:
 *   1. An ADMIN-SAVED row in `app_settings` (key `payment_method_<channel>`)
 *      always wins — exactly what the admin typed last.
 *   2. When nothing was saved yet, the instance ENV defaults apply, so the
 *      app works out of the box and no invented numbers are sent down.
 * The master switch `payment_transfers_enabled` (plus the env MANUAL_PAYMENTS_
 * ENABLED flag) turns the whole manual-transfer flow off in one tap.
 *
 * These values are server configuration, never a client asset: the customer
 * only ever receives the account for the order they are paying into.
 */

export type TransferChannel = 'ubl' | 'easypaisa' | 'jazzcash';

export const TRANSFER_CHANNELS: TransferChannel[] = ['ubl', 'easypaisa', 'jazzcash'];

export interface PaymentMethodConfig {
  enabled: boolean;
  /** Human label shown to customers, e.g. 'UBL — United Bank Limited'. */
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string;
  branch?: string;
}

export interface PaymentMethodView {
  channel: TransferChannel;
  /** Checkout method key this channel backs. */
  method: string;
  label: string;
  config: PaymentMethodConfig;
  /** Where the active values come from, so the admin knows what they edit. */
  source: 'database' | 'env-default';
  settingKey: string;
}

/** app_settings key per channel under which the admin-saved config lives. */
export function paymentMethodSettingKey(channel: TransferChannel): string {
  if (!TRANSFER_CHANNELS.includes(channel)) throw NOT_FOUND('Unknown payment channel');
  return `payment_method_${channel}`;
}

/** Master switch key: false stops every manual transfer method at once. */
export const TRANSFERS_ENABLED_KEY = 'payment_transfers_enabled';

/**
 * The instance defaults, straight from ENV. These are NOT invented here — they
 * are exactly what the deployed backend already served before this service
 * existed, so switching to database-backed values cannot change subtly.
 */
export function envPaymentMethodDefaults(channel: TransferChannel): PaymentMethodConfig {
  switch (channel) {
    case 'ubl':
      return {
        enabled: true,
        bankName: env.MANUAL_PAYMENT_BANK_NAME,
        accountTitle: env.UBL_ACCOUNT_TITLE,
        accountNumber: env.UBL_ACCOUNT_NUMBER,
        ...(env.UBL_IBAN ? { iban: env.UBL_IBAN } : {}),
        ...(env.UBL_BRANCH ? { branch: env.UBL_BRANCH } : {}),
      };
    case 'easypaisa':
      return {
        enabled: true,
        bankName: 'Easypaisa mobile account',
        accountTitle: env.EASYPAISA_TRANSFER_TITLE,
        accountNumber: env.EASYPAISA_TRANSFER_NUMBER,
      };
    case 'jazzcash':
      return {
        enabled: true,
        bankName: 'JazzCash mobile account',
        accountTitle: env.JAZZCASH_TRANSFER_TITLE,
        accountNumber: env.JAZZCASH_TRANSFER_NUMBER,
      };
  }
}

/**
 * PURE merge used by tests and both read paths. A stored DB value replaces the
 * env defaults wholesale (what the admin sees is what the admin gets): missing
 * display-only fields fall back to the env/book defaults so a half-typed save
 * can never blank the checkout screen.
 */
export function mergePaymentMethodConfig(
  channel: TransferChannel,
  stored: unknown,
): { config: PaymentMethodConfig; source: 'database' | 'env-default' } {
  const d = envPaymentMethodDefaults(channel);
  if (!stored || typeof stored !== 'object') return { config: d, source: 'env-default' };
  const s = stored as Record<string, unknown>;
  const str = (key: string): string => (typeof s[key] === 'string' ? String(s[key]).trim() : '');
  return {
    config: {
      enabled: Boolean(s.enabled),
      bankName: str('bankName') || d.bankName,
      accountTitle: str('accountTitle') || d.accountTitle,
      accountNumber: str('accountNumber') || d.accountNumber,
      ...(str('iban') ? { iban: str('iban') } : d.iban ? { iban: d.iban } : {}),
      ...(str('branch') ? { branch: str('branch') } : d.branch ? { branch: d.branch } : {}),
    },
    source: 'database',
  };
}

/** The config the customer/admin sees right now for one channel. */
export async function getPaymentMethodConfig(
  channel: TransferChannel,
): Promise<{ config: PaymentMethodConfig; source: 'database' | 'env-default'; settingKey: string }> {
  const settingKey = paymentMethodSettingKey(channel);
  const stored = await getSetting(settingKey);
  return { settingKey, ...mergePaymentMethodConfig(channel, stored) };
}

/** The manual-transfer master switch: DB setting first, then the env flag. */
export async function transfersEnabled(): Promise<boolean> {
  const stored = await getSetting(TRANSFERS_ENABLED_KEY);
  if (typeof stored === 'boolean') return stored;
  return manualPaymentsEnabled;
}

/** The display label each channel is advertised under. */
export function channelLabel(channel: TransferChannel): string {
  return channel === 'ubl'
    ? 'Direct Bank Transfer (UBL)'
    : channel === 'easypaisa'
      ? 'Easypaisa (Direct Transfer)'
      : 'JazzCash (Direct Transfer)';
}

/** Every enabled channel with its merged config, in a stable display order. */
export async function enabledTransferMethods(): Promise<
  Array<PaymentMethodConfig & { channel: TransferChannel; method: string; label: string }>
> {
  const master = await transfersEnabled();
  if (!master) return [];
  const rows = await Promise.all(
    TRANSFER_CHANNELS.map(async (channel) => ({ channel, ...(await getPaymentMethodConfig(channel)) })),
  );
  return rows
    .filter((row) => row.config.enabled)
    .map((row) => ({
      ...row.config,
      channel: row.channel,
      method: row.channel,
      label: channelLabel(row.channel),
    }));
}

/** All three channels for the admin settings page, whatever their state. */
export async function listPaymentMethodConfigs(): Promise<PaymentMethodView[]> {
  const rows = await Promise.all(
    TRANSFER_CHANNELS.map(async (channel) => {
      const { config, source, settingKey } = await getPaymentMethodConfig(channel);
      return { channel, method: channel, label: channelLabel(channel), config, source, settingKey };
    }),
  );
  return rows;
}

/**
 * Admin save. Whole-row replace from the admin panel, the same merge rules
 * applied on read. An ENABLED channel must carry a title + account number —
 * disabling releases that requirement so an account can be parked off.
 */
export async function savePaymentMethodConfig(
  channel: TransferChannel,
  input: {
    enabled: boolean;
    accountTitle?: string;
    accountNumber?: string;
    bankName?: string;
    iban?: string;
    branch?: string;
    label?: string;
    description?: string;
  },
): Promise<PaymentMethodConfig> {
  const key = paymentMethodSettingKey(channel);
  const incoming = {
    enabled: Boolean(input.enabled),
    bankName: (input.bankName ?? '').trim(),
    accountTitle: (input.accountTitle ?? '').trim(),
    accountNumber: (input.accountNumber ?? '').trim(),
    iban: (input.iban ?? '').trim(),
    branch: (input.branch ?? '').trim(),
  };

  if (incoming.enabled) {
    // Validate the EFFECTIVE final config, not just the incoming fields:
    // incoming values win, then the admin's earlier saved row, then the
    // server defaults. This is what lets a plain enable-toggle work —
    // e.g. JazzCash switched off then on again with no new details keeps
    // the real default number — while a channel with NO usable account
    // anywhere still cannot be enabled.
    const current = await getPaymentMethodConfig(channel);
    const effective = mergePaymentMethodConfig(channel, {
      ...current.config,
      ...incoming,
    }).config;
    if (effective.accountTitle.length < 3) {
      throw BAD_REQUEST('Account title must be at least 3 characters when the method is enabled');
    }
    if (effective.accountNumber.length < 5) {
      throw BAD_REQUEST('Account number must be at least 5 characters when the method is enabled');
    }
  }

  // Store the admin's exact values; the merge on read tops display-only
  // blanks up with the defaults so the checkout never renders empty rows.
  const stored = {
    enabled: incoming.enabled,
    ...(incoming.bankName ? { bankName: incoming.bankName } : {}),
    ...(incoming.accountTitle ? { accountTitle: incoming.accountTitle } : {}),
    ...(incoming.accountNumber ? { accountNumber: incoming.accountNumber } : {}),
    ...(incoming.iban ? { iban: incoming.iban } : {}),
    ...(incoming.branch ? { branch: incoming.branch } : {}),
  };

  await setSetting(key, stored, input.label ?? `Manual transfer account (${channel})`);
  return getPaymentMethodConfig(channel).then((r) => r.config);
}

/** Admin master switch for the whole manual-transfer flow. */
export async function setTransfersEnabled(enabled: boolean): Promise<void> {
  await setSetting(TRANSFERS_ENABLED_KEY, enabled, 'Manual transfer payments enabled');
}

export async function requireTransfersEnabled(): Promise<void> {
  if (!(await transfersEnabled())) {
    throw new AppError('Manual transfer payments are temporarily disabled', 503);
  }
}
