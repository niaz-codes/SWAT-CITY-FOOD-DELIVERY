import { createHmac, timingSafeEqual } from 'crypto';
import { env, jazzcashBaseUrl, jazzcashConfigured } from '../../config/env';
import { AppError } from '../../utils/AppError';
import {
  JAZZCASH_SUCCESS_CODE,
  type GatewayInitiateResult,
  type GatewayVerifyResult,
  type InitiateInput,
  type PaymentProvider,
  type VerifyInput,
} from './types';

/** Documented Jazz Payment Portal paths (Integration Guide §11 / v4.2 references). */
const HOSTED_CHECKOUT_PATH = '/ApplicationAPI/API/2.0/Purchase/SecuredHashPost';
const INQUIRY_PATH = '/ApplicationAPI/API/2.0/Purchase/DoTransactionInquiry';

export type JazzFieldMap = Record<string, string>;

/**
 * JazzCash's `pp_ExpiryDate` is itself part of the signed payload, so the
 * checkout URL cannot be regenerated arbitrarily late. These bounds keep a replay
 * inside the window Jazz expects.
 */
const MIN_PAYMENT_WINDOW_MINUTES = 5;
const MAX_PAYMENT_WINDOW_MINUTES = 24 * 60;

/**
 * Jazz amounts are in paisa as an integer string: PKR 100 -> "10000".
 * Rounding (not truncation) keeps the charge equal to the server-side total.
 */
export const toPaisa = (amountPkr: number): string => String(Math.round(amountPkr * 100));

/**
 * Builds `pp_SecureHash` exactly as the Jazz guide specifies:
 *
 *   1. take every `pp_*` field value (blank values are omitted),
 *   2. sort the values by ASCII order,
 *   3. join with `&` (no trailing separator),
 *   4. prepend the shared secret,
 *   5. reinterpret that string as ISO-8859-1 bytes,
 *   6. HMAC-SHA256 it with the UTF-8 encoded shared secret as the key,
 *   7. hex, uppercase.
 *
 * `pp_SecureHash` itself must never be part of its own input.
 */
export function jazzCashSecureHash(fields: JazzFieldMap, salt: string): string {
  const values = Object.entries(fields)
    .filter(([key]) => key.startsWith('pp_') && key !== 'pp_SecureHash')
    .map(([, value]) => (typeof value === 'string' ? value.trim() : String(value ?? '')))
    .filter((value) => value.length > 0);

  // JS string sort is UTF-16 code-unit order, which matches ASCII for these fields.
  values.sort();

  const toSign = `${salt}${values.join('&')}`;
  const isoBytes = Buffer.from(toSign, 'utf8').toString('latin1');
  return createHmac('sha256', Buffer.from(salt, 'utf8'))
    .update(Buffer.from(isoBytes, 'latin1'))
    .digest('hex')
    .toUpperCase();
}

/** Constant-time comparison of a returned hash against the expected one. */
function hashMatches(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Jazz expects `yyyyMMddHHmmss`. The gateway is operated in PKT, so format in
 * Asia/Karachi rather than trusting whatever timezone the host happens to use.
 */
export function gatewayDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

function salt(): string {
  const value = env.JAZZCASH_INTEGRITY_SALT;
  if (!value) throw new AppError('JazzCash integrity salt is not configured', 503);
  return value;
}

async function postJson(
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${jazzcashBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(env.PAYMENT_GATEWAY_TIMEOUT_MS),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new AppError(`JazzCash returned a non-JSON response (HTTP ${res.status})`, 502);
  }
  if (!res.ok) {
    throw new AppError(`JazzCash request failed with HTTP ${res.status}`, 502);
  }
  return json;
}

/** Reads the first present key; Jazz mixes `pp_*`, `Response*` and camelCase. */
function pick(json: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = json[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/**
 * JazzCash hosted checkout (`MPAY`, mobile account).
 *
 * The payer's JazzCash credentials are entered on Jazz's own page, so this
 * provider never sees them. After the payer returns, we still do NOT trust the
 * redirect — we re-confirm with `DoTransactionInquiry` before marking anything
 * paid.
 */
export const jazzcashProvider: PaymentProvider = {
  name: 'jazzcash',
  displayName: 'JazzCash',

  isConfigured: () => jazzcashConfigured,

  configurationHint: () =>
    jazzcashConfigured
      ? 'JazzCash is ready.'
      : 'Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD and JAZZCASH_INTEGRITY_SALT.',

  async initiate(input: InitiateInput): Promise<GatewayInitiateResult> {
    if (!jazzcashConfigured) {
      return { ok: false, reason: jazzcashProvider.configurationHint() };
    }

    const amountPaisa = toPaisa(input.amountPkr);
    const now = new Date();

    // Clamp the signed expiry window: Jazz rejects an already-expired payload, and
    // a very long window widens the replay window for the signed POST.
    const windowMinutes = Math.min(
      Math.max(env.PAYMENT_EXPIRY_MINUTES, MIN_PAYMENT_WINDOW_MINUTES),
      MAX_PAYMENT_WINDOW_MINUTES,
    );
    const expiry = new Date(now.getTime() + windowMinutes * 60_000);

    // Field names are dictated by Jazz. Order here is irrelevant — the hash
    // sorts by value — but pp_Amount must be paisa and pp_TxnCurrency is fixed PKR.
    const fields: JazzFieldMap = {
      pp_Version: env.JAZZCASH_API_VERSION,
      pp_TxnType: 'MPAY',
      pp_Language: 'EN',
      pp_MerchantID: env.JAZZCASH_MERCHANT_ID as string,
      pp_Password: env.JAZZCASH_PASSWORD as string,
      pp_TxnRefNo: input.transactionRef,
      pp_Amount: amountPaisa,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: gatewayDateTime(now),
      pp_TxnExpiryDateTime: gatewayDateTime(expiry),
      pp_BillReference: input.orderNumber,
      pp_Description: input.description,
      pp_ReturnURL: input.returnUrl,
      pp_CustomerEmail: input.customerEmail,
      pp_CustomerMobile: input.customerPhone,
    };

    return {
      ok: true,
      handoff: {
        type: 'form',
        url: `${jazzcashBaseUrl}${HOSTED_CHECKOUT_PATH}`,
        // The signed payload is rendered server-side by the handoff page; these
        // fields contain the gateway password, so they are never sent to a client.
        fields: { ...fields, pp_SecureHash: jazzCashSecureHash(fields, salt()) },
      },
    };
  },

  async verify(input: VerifyInput): Promise<GatewayVerifyResult> {
    if (!jazzcashConfigured) {
      return { status: 'pending', reason: jazzcashProvider.configurationHint() };
    }

    const fields: JazzFieldMap = {
      pp_TxnRefNo: input.transactionRef,
      pp_MerchantID: env.JAZZCASH_MERCHANT_ID as string,
      pp_Password: env.JAZZCASH_PASSWORD as string,
      pp_Version: env.JAZZCASH_API_VERSION,
    };
    const payload = { ...fields, pp_SecureHash: jazzCashSecureHash(fields, salt()) };

    const json = await postJson(INQUIRY_PATH, payload);

    const responseCode = pick(json, 'pp_ResponseCode', 'responseCode', 'ResponseCode');
    const responseMessage = pick(json, 'pp_ResponseMessage', 'responseMessage', 'ResponseMessage');
    const returnedAmountPaisa = pick(json, 'pp_Amount', 'amount');
    const returnedCurrency = pick(json, 'pp_TxnCurrency', 'currency');
    const rrn = pick(json, 'pp_RetreivalReferenceNo', 'rrn', 'retrievalReferenceNo');
    const status = pick(json, 'pp_Status', 'status').toUpperCase();

    if (responseCode !== JAZZCASH_SUCCESS_CODE) {
      return {
        status: 'pending',
        code: responseCode || undefined,
        reason: responseMessage || `JazzCash inquiry returned code ${responseCode || 'unknown'}`,
        raw: json,
      };
    }

    // Jazz reports a confirmed mobile-account debit with response code 000. When
    // an explicit status is also present it must not contradict the success code.
    const contradicted = ['FAILED', 'FAILURE', 'DECLINED', 'CANCELLED', 'EXPIRED', 'REVERSED'];
    if (status && contradicted.includes(status)) {
      return {
        status: 'failed',
        code: status,
        reason: responseMessage || `JazzCash reported ${status}`,
        raw: json,
      };
    }

    if (returnedAmountPaisa) {
      const expectedPaisa = toPaisa(input.expectedAmountPkr);
      if (returnedAmountPaisa !== expectedPaisa) {
        return {
          status: 'failed',
          reason: `Amount mismatch: gateway settled ${returnedAmountPaisa} paisa, expected ${expectedPaisa}`,
          raw: json,
        };
      }
    }
    if (returnedCurrency && returnedCurrency.toUpperCase() !== 'PKR') {
      return { status: 'failed', reason: `Unexpected currency ${returnedCurrency}`, raw: json };
    }

    return {
      status: 'paid',
      amount: input.expectedAmountPkr,
      currency: 'PKR',
      gatewayRef: rrn || input.gatewayRef,
      raw: json,
    };
  },
};

/**
 * Validates the `pp_SecureHash` Jazz appends to the return URL. A mismatch means
 * the query string was tampered with in transit. This is a defence-in-depth check
 * only — the caller must still confirm via inquiry before marking a payment paid.
 */
export function verifyJazzCashReturnSignature(
  returnFields: Record<string, string | undefined>,
): boolean {
  if (!jazzcashConfigured) return false;
  const fields: JazzFieldMap = {};
  for (const [key, value] of Object.entries(returnFields)) {
    if (key.startsWith('pp_') && typeof value === 'string' && value.trim() !== '') {
      fields[key] = value.trim();
    }
  }
  const received = fields.pp_SecureHash;
  if (!received) return false;
  const expected = jazzCashSecureHash(fields, env.JAZZCASH_INTEGRITY_SALT as string);
  return hashMatches(expected, received);
}
