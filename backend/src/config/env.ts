// ============================================================
// Swat City Backend - Config: environment parsing (Zod-safe)
// FAILS FAST at boot if required values are missing/invalid.
// ============================================================

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Multi-line secrets (Firebase service account private keys) can be provided as
 * a single-line JSON blob with escaped "\n" so they survive .env / hosting
 * dashboard parsing. Normalise those back into real newlines here.
 */
function normalizeMultiline(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),

  /**
   * Public origin of the deployed backend, e.g. https://api.swatcity.pk.
   * Used to build the password-reset deep links inside emails. No trailing
   * slash. Falls back to localhost so local development always works.
   */
  PUBLIC_API_URL: z.string().default(''),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('swat-city-backend'),

  // --- Cloudinary -----------------------------------------------------------
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // --- Brevo (transactional email over SMTP) --------------------------------
  BREVO_SMTP_HOST: z.string().default('smtp-relay.brevo.com'),
  BREVO_SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** Brevo SMTP login — the `xxx@smtp-brevo.com` address. */
  BREVO_SMTP_USER: z.string().optional(),
  /** Brevo SMTP key (starts with `xsmtpsib-`). Never logged. */
  BREVO_SMTP_PASS: z.string().optional(),
  /** Verified sender address in Brevo. */
  BREVO_FROM_EMAIL: z.string().optional(),
  BREVO_FROM_NAME: z.string().default('Swat City Food Delivery'),

  // --- Firebase Cloud Messaging (server side) -------------------------------
  /**
   * The whole Firebase service account as one line of JSON (newlines escaped).
   * Preferred because hosting platforms inject env vars as single-line values.
   * Alternative: point FIREBASE_SERVICE_ACCOUNT_PATH at the downloaded JSON.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** Filesystem path to the downloaded service account JSON (local dev). */
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  /** Legacy split-variable form, kept as a fallback. */
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // --- Expo Push Service ----------------------------------------------------
  /**
   * The mobile app runs in Expo Go, so device tokens are Expo Push tokens and
   * delivery goes over the Expo Push API. Set to "false" to disable that
   * transport and keep FCM as the only one.
   */
  EXPO_PUSH_ENABLED: z.enum(['true', 'false']).default('true'),
  /**
   * Optional Expo access token. Only required when the Expo account has push
   * security (enhanced message delivery) enabled.
   */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // --- Password reset -------------------------------------------------------
  /** Lifetime of a password-reset token, in minutes. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  /** Max verification attempts before a reset token is burned. */
  PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // --- Easypaisa (official Easypay REST v4 integration) ---------------------
  /**
   * Field names below follow the official Easypay Merchant Integration Guide.
   * NOTE: the gateway authenticates a *partner account* with a username and
   * password sent as a Base64 `Credentials` header — there is no "API key".
   */
  EASYPAISA_ENVIRONMENT: z.enum(['staging', 'production']).default('staging'),
  EASYPAISA_BASE_URL: z.string().optional(),
  /** Partner account username issued by the Easypaisa team. */
  EASYPAISA_USERNAME: z.string().optional(),
  /** Partner account password issued by the Easypaisa team. */
  EASYPAISA_PASSWORD: z.string().optional(),
  /** Store ID assigned at merchant registration. Must match the credentials. */
  EASYPAISA_STORE_ID: z.string().optional(),
  /** "EWP Account #" shown on the Easypaisa merchant portal profile page. */
  EASYPAISA_ACCOUNT_NUMBER: z.string().optional(),

  // --- JazzCash Payment Gateway (official integration guide) ----------------
  JAZZCASH_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  JAZZCASH_BASE_URL: z.string().optional(),
  /** Merchant code issued by Jazz (`pp_MerchantID`). */
  JAZZCASH_MERCHANT_ID: z.string().optional(),
  /** Gateway API password issued by Jazz (`pp_Password`) — NOT the portal login. */
  JAZZCASH_PASSWORD: z.string().optional(),
  /** Shared secret used to build `pp_SecureHash` (HMAC-SHA256). */
  JAZZCASH_INTEGRITY_SALT: z.string().optional(),
  /** Jazz API version. The guide allows '1.1' or '2.0'; 2.0 is the current one. */
  JAZZCASH_API_VERSION: z.enum(['1.1', '2.0']).default('2.0'),

  // --- Shared payment behaviour --------------------------------------------
  /** Where the gateway sends the payer back to. Defaults to the deep link. */
  PAYMENT_RETURN_URL: z.string().optional(),
  /** Per-request timeout when calling a gateway, in milliseconds. */
  PAYMENT_GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  /** How long a pending online payment stays open before it can be abandoned. */
  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),

  ADMIN_EMAIL: z.string().email().default('admin@swatcity.pk'),
  ADMIN_PHONE: z.string().default('03001112222'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin@SwatCity2026'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

// Un-escape multi-line secrets once, here, so nothing downstream has to think
// about "\n" vs newline.
export const env = {
  ...data,
  FIREBASE_SERVICE_ACCOUNT_JSON: normalizeMultiline(data.FIREBASE_SERVICE_ACCOUNT_JSON),
  FIREBASE_PRIVATE_KEY: normalizeMultiline(data.FIREBASE_PRIVATE_KEY),
};

export const isProduction = env.NODE_ENV === 'production';

export const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

/** Public base URL of this API, always without a trailing slash. */
export const publicApiUrl = (env.PUBLIC_API_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, '');

export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export const brevoConfigured = Boolean(env.BREVO_SMTP_USER && env.BREVO_SMTP_PASS && env.BREVO_FROM_EMAIL);

/**
 * FCM is considered configured when EITHER the single-blob service account or
 * the legacy split variables are present.
 */
export const firebaseConfigured = Boolean(
  env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY),
);

/**
 * Documented Easypay hosts. `EASYPAISA_BASE_URL` overrides these so the merchant
 * can be pointed at a dedicated base URL handed over by the Easypaisa team.
 */
export const easypaisaBaseUrl = (
  env.EASYPAISA_BASE_URL ??
  (env.EASYPAISA_ENVIRONMENT === 'production'
    ? 'https://easypay.easypaisa.com.pk'
    : 'https://easypaystg.easypaisa.com.pk')
).replace(/\/+$/, '');

/** Documented Jazz Payment Portal hosts (sandbox vs live). */
export const jazzcashBaseUrl = (
  env.JAZZCASH_BASE_URL ??
  (env.JAZZCASH_ENVIRONMENT === 'production'
    ? 'https://payments.jazzcash.com.pk'
    : 'https://sandbox.jazzcash.com.pk')
).replace(/\/+$/, '');

/**
 * A gateway is only usable when every credential the documented request needs is
 * present. Missing credentials are a configuration error, never a silent skip.
 */
export const easypaisaConfigured = Boolean(
  env.EASYPAISA_USERNAME && env.EASYPAISA_PASSWORD && env.EASYPAISA_STORE_ID,
);

/**
 * Easypaisa transaction inquiry additionally requires the merchant EWP account
 * number, so "configured" for the full flow needs all four values.
 */
export const easypaisaFullyConfigured = Boolean(easypaisaConfigured && env.EASYPAISA_ACCOUNT_NUMBER);

export const jazzcashConfigured = Boolean(
  env.JAZZCASH_MERCHANT_ID && env.JAZZCASH_PASSWORD && env.JAZZCASH_INTEGRITY_SALT,
);