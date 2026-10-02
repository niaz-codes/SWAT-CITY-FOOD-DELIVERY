import { env, easypaisaBaseUrl, easypaisaFullyConfigured } from '../../config/env';
import { AppError } from '../../utils/AppError';
import {
  EASYPAISA_SUCCESS_CODE,
  EASYPAISA_TERMINAL_FAILURES,
  type GatewayInitiateResult,
  type GatewayVerifyResult,
  type InitiateInput,
  type PaymentProvider,
  type VerifyInput,
} from './types';

/**
 * Documented Easypay REST v4 paths (Merchant Integration Guide §4.3 / §4.4).
 * Only the OTC / MA / Inquiry trio is in scope for the REST gateway.
 */
const INITIATE_MA_PATH = '/easypay-service/rest/v4/initiate-ma-transaction';
const INQUIRE_PATH = '/easypay-service/rest/v4/inquire-transaction';

/** Easypaisa requires `03xxxxxxxxx`. */
const MSISDN_RE = /^03\d{9}$/;

export function normalizeMsisdn(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // Strip spaces, dashes, parentheses and a leading +92 / 0092 country code.
  let digits = raw.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+92')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0092')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('92') && digits.length === 12) digits = `0${digits.slice(2)}`;
  return MSISDN_RE.test(digits) ? digits : null;
}

/** Easypaisa expects a decimal amount with two places, e.g. "1500.00". */
const money = (amountPkr: number) => amountPkr.toFixed(2);

function credentialsHeader(): string {
  const { EASYPAISA_USERNAME, EASYPAISA_PASSWORD } = env;
  if (!EASYPAISA_USERNAME || !EASYPAISA_PASSWORD) {
    throw new AppError('Easypaisa credentials are not configured', 503);
  }
  // Documented as: Base64(username:password) in a `Credentials` header.
  return Buffer.from(`${EASYPAISA_USERNAME}:${EASYPAISA_PASSWORD}`, 'utf8').toString('base64');
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${easypaisaBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Credentials: credentialsHeader(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(env.PAYMENT_GATEWAY_TIMEOUT_MS),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new AppError(`Easypaisa returned a non-JSON response (HTTP ${res.status})`, 502);
  }
  // A gateway auth/merchant problem surfaces as an HTTP error with a body. Never
  // continue to "paid" on an unsuccessful HTTP call.
  if (!res.ok) {
    const desc = typeof json.responseDesc === 'string' ? json.responseDesc : `HTTP ${res.status}`;
    throw new AppError(`Easypaisa request failed: ${desc}`, 502);
  }
  return json;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : Number.NaN;
};

/**
 * Easypaisa Mobile Account (MA) provider.
 *
 * MA is the correct mode for a food-delivery app: it debits the customer's
 * Easypaisa wallet directly, settles instantly, and — unlike OTC, which issues a
 * token to be paid at a physical shop — needs no redirect. The payer authorises
 * on their handset, so the transaction can legitimately sit in PENDING for a
 * while; the authoritative answer therefore always comes from `verify`.
 */
export const easypaisaProvider: PaymentProvider = {
  name: 'easypaisa',
  displayName: 'Easypaisa',

  // Must match `initiate`: an account number is required to build the request, so
  // advertising the wallet as available without it would fail at checkout.
  isConfigured: () => easypaisaFullyConfigured,

  configurationHint: () =>
    easypaisaFullyConfigured
      ? 'Easypaisa is ready.'
      : 'Set EASYPAISA_USERNAME, EASYPAISA_PASSWORD, EASYPAISA_STORE_ID and EASYPAISA_ACCOUNT_NUMBER.',

  async initiate(input: InitiateInput): Promise<GatewayInitiateResult> {
    if (!easypaisaFullyConfigured) {
      return { ok: false, reason: easypaisaProvider.configurationHint() };
    }

    const mobileAccountNo = normalizeMsisdn(input.customerPhone);
    if (!mobileAccountNo) {
      return {
        ok: false,
        reason: 'Enter a valid Easypaisa mobile number (03xxxxxxxxx)',
      };
    }

    const storeId = env.EASYPAISA_STORE_ID as string;

    const json = await postJson(INITIATE_MA_PATH, {
      orderId: input.transactionRef,
      storeId,
      transactionAmount: money(input.amountPkr),
      transactionType: 'MA',
      mobileAccountNo,
      emailAddress: input.customerEmail,
    });

    const responseCode = str(json.responseCode);

    // Documented codes for MA. Undocumented codes (e.g. 0017) surface as
    // failures too — never treat an unknown code as success.
    if (responseCode !== EASYPAISA_SUCCESS_CODE) {
      return {
        ok: false,
        code: responseCode || undefined,
        reason: str(json.responseDesc) || `Easypaisa rejected the payment (code ${responseCode || 'unknown'})`,
      };
    }

    return {
      ok: true,
      // No redirect: the payer stays in the app and authorises on their handset.
      handoff: null,
      gatewayRef: str(json.transactionId) || undefined,
    };
  },

  async verify(input: VerifyInput): Promise<GatewayVerifyResult> {
    if (!easypaisaFullyConfigured) {
      return { status: 'pending', reason: easypaisaProvider.configurationHint() };
    }

    const storeId = env.EASYPAISA_STORE_ID as string;
    const accountNum = env.EASYPAISA_ACCOUNT_NUMBER as string;

    const json = await postJson(INQUIRE_PATH, {
      orderId: input.transactionRef,
      storeId,
      accountNum,
    });

    const responseCode = str(json.responseCode);
    // 0003/0004 etc. mean the gateway could not find/accept the reference. That
    // is not proof of failure, so keep it pending and let the caller retry.
    if (responseCode && responseCode !== EASYPAISA_SUCCESS_CODE) {
      return {
        status: 'pending',
        code: responseCode,
        reason: str(json.responseDesc) || `Easypaisa inquiry returned code ${responseCode}`,
        raw: json,
      };
    }

    const transactionStatus = str(json.transactionStatus).toUpperCase();

    if (transactionStatus === 'PAID') {
      const settledAmount = num(json.transactionAmount);
      // A settled amount that differs from what we asked for is never a match,
      // even if the gateway says PAID. Fail closed and escalate.
      if (Number.isFinite(settledAmount) && Math.abs(settledAmount - input.expectedAmountPkr) > 0.009) {
        return {
          status: 'failed',
          reason: `Amount mismatch: charged ${settledAmount} but expected ${input.expectedAmountPkr}`,
          raw: json,
        };
      }
      return {
        status: 'paid',
        amount: Number.isFinite(settledAmount) ? settledAmount : input.expectedAmountPkr,
        currency: 'PKR',
        gatewayRef: str(json.paymentToken) || input.gatewayRef,
        raw: json,
      };
    }

    if ((EASYPAISA_TERMINAL_FAILURES as readonly string[]).includes(transactionStatus)) {
      return {
        status: 'failed',
        reason: str(json.responseDesc) || `Easypaisa reported ${transactionStatus}`,
        raw: json,
      };
    }

    // Includes PENDING (authorisation still in flight) and an empty status.
    return {
      status: 'pending',
      reason: str(json.responseDesc) || `Easypaisa status: ${transactionStatus || 'unknown'}`,
      raw: json,
    };
  },
};