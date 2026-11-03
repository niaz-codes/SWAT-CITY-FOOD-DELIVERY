// ============================================================
// Swat City Backend - Config: environment parsing (Zod-safe)
// FAILS FAST at boot if required values are missing/invalid.
// ============================================================

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),

  /**
   * Public origin of the deployed backend, e.g. https://api.swatcity.pk.
   * Used to build the payment handoff/return URLs. No trailing slash. Falls
   * back to localhost so local development always works.
   */
  PUBLIC_API_URL: z.string().default(''),

  /**
   * Optional target for links inside Supabase Auth emails, e.g.
   * `swatcity://auth` or `https://swatcity.pk/verified`. Must also be listed
   * in the project's Redirect URLs, otherwise Supabase falls back to the Site
   * URL. Leave blank to use the Site URL. The app verifies the typed code, so
   * this only matters if a dashboard template still renders a link.
   */
  AUTH_EMAIL_REDIRECT_URL: z.string().default(''),

  // --- Supabase (Postgres + Storage) ---------------------------------------
  /** Supabase project URL, e.g. https://xxx.supabase.co */
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  /**
   * Service-role (secret) key. Server-side only — it bypasses Row Level
   * Security, so it must never reach a client bundle.
   */
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY is required'),
  /** Public/anon (publishable) key, kept for completeness. */
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  /** Storage bucket where uploaded images/documents are stored. */
  SUPABASE_STORAGE_BUCKET: z.string().default('swat-city'),

  // --- Cloudinary (optional image host) --------------------------------------
  /**
   * Cloudinary is OPTIONAL. When these three are absent the app stores every
   * upload in Supabase Storage (the bucket above) instead, so a deployment
   * without a Cloudinary account still accepts rider photos and admin images.
   * Leaving them blank costs nothing but the Cloudinary CDN.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('swat-city-backend'),

  // --- Outbound email over SMTP (password-changed notice only) --------------
  // OTP codes (login / register / reset) are generated, emailed and verified by
  // SUPABASE AUTH. This SMTP config only carries the "your password was
  // changed" security notice, so leaving it blank costs that notice and nothing
  // else. Any SMTP provider works; the default targets the project Gmail
  // account (requires a Google App Password, not the normal password).
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** SMTP login. For Gmail: the full Gmail address. */
  SMTP_USER: z.string().optional(),
  /** SMTP password / app password. Never logged. */
  SMTP_PASS: z.string().optional(),
  /** From address shown to recipients; must be allowed by the SMTP provider. */
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('Swat City Food Delivery'),

  // --- Expo Push Service ----------------------------------------------------
  /**
   * The mobile app runs in Expo Go, so device tokens are Expo Push tokens and
   * delivery goes over the Expo Push API. Set to "false" to disable push.
   */
  EXPO_PUSH_ENABLED: z.enum(['true', 'false']).default('true'),
  /**
   * Optional Expo access token. Only required when the Expo account has push
   * security (enhanced message delivery) enabled.
   */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // --- Firebase Cloud Messaging v1 (direct FCM, service-account) --------------
  /**
   * Direct FCM v1 delivery for devices that register a real FCM token (Android
   * APK/release builds with this Firebase project). The service account JSON
   * from Firebase Console → Project Settings → Service accounts; paste the raw
   * JSON document or its Base64 encoding. Leave blank to keep Expo Push as the
   * only remote transport (the app's mixed token list stays valid either way).
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** Optional explicit project id; normally derived from the service account. */
  FIREBASE_PROJECT_ID: z.string().optional(),
  /** Master switch for the direct-FCM transport (Expo Push is unaffected). */
  FCM_ENABLED: z.enum(['true', 'false']).default('true'),

  // --- Manual payment reminders ------------------------------------------------
  /**
   * A manual-transfer order waiting for admin verification older than this
   * many hours gets ONE reminder push to its customer (re-reminded at most
   * again from the next reminder threshold, never per sweep).
   */
  PAYMENT_REMINDER_HOURS: z.coerce.number().int().positive().default(2),

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

  // --- DIRECT / MANUAL transfer payments (admin-verified, no gateway API) ---
  /**
   * The "Direct Bank Transfer (UBL)" + manual Easypaisa/JazzCash options ask the
   * customer to move money THEMSELVES into the company accounts below, then
   * submit the transaction reference and a receipt screenshot. NOTHING is
   * settled automatically: an authorised admin compares every submission with
   * the real UBL bank statement before the payment is marked verified. There is
   * NO bank API behind this — a config change here only changes what the
   * customer is asked to do, never the verification result.
   *
   * These numbers are receiving-account details, not API credentials — no
   * secret that could move money lives in this section. The values are handed
   * to the customer only for an order they own (order-scoped endpoint); they
   * are never bundled into a public client asset.
   */
  MANUAL_PAYMENTS_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Label the customer sees, e.g. 'UBL — United Bank Limited'. */
  MANUAL_PAYMENT_BANK_NAME: z.string().min(3).default('UBL – United Bank Limited'),
  /** UBL receiving account title printed on the transfer receipt. */
  UBL_ACCOUNT_TITLE: z.string().min(3).default('Swat City Food Delivery'),
  /** UBL account number the customer transfers INTO. */
  UBL_ACCOUNT_NUMBER: z.string().min(4).default('0405289118711'),
  /** Optional UBL IBAN (-- tell the customer which format to use). */
  UBL_IBAN: z.string().optional(),
  /** Optional bank branch hint shown under the account number. */
  UBL_BRANCH: z.string().optional(),
  /** Company Easypaisa mobile account the customer can transfer to instead. */
  EASYPAISA_TRANSFER_NUMBER: z.string().min(10).default('03450050667'),
  EASYPAISA_TRANSFER_TITLE: z.string().min(3).default('Swat City Food Delivery'),
  /** Company JazzCash mobile account (manual transfer, NOT the gateway). */
  JAZZCASH_TRANSFER_NUMBER: z.string().min(10).default('03265521032'),
  JAZZCASH_TRANSFER_TITLE: z.string().min(3).default('Swat City Food Delivery'),
  /**
   * PRIVATE Storage bucket for payment receipt screenshots. Backed by the
   * service role only — every read is arbitrated by the backend through a
   * short-lived signed URL, and a customer can only reach the receipts of
   * their own orders through the API.
   */
  MANUAL_PAYMENT_RECEIPT_BUCKET: z.string().default('payment-receipts'),
  /** How long the admin/customer receipt preview link stays valid, minutes. */
  MANUAL_PAYMENT_RECEIPT_URL_MINUTES: z.coerce.number().int().positive().default(30),

  // --- Demo payments (TESTING ONLY — never real money) ----------------------
  /**
   * Master switch for the simulated "Demo Pay" checkout method. When "true",
   * GET /payments/methods offers a clearly-labelled demo method and a demo
   * payment settles against the ADMIN's wallet ledger — with a
   * "DEMO — NOT REAL MONEY" label on every record. No gateway is contacted and
   * no card/wallet credential is ever involved, so money can NEVER actually
   * move. Must stay "false" in production once real gateways are wired up.
   */
  DEMO_PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),

  // --- Automatic rider dispatch (payment-approved, ready orders) -------------
  /**
   * When an order becomes `ready` (and only ever after its payment has been
   * verified — see dispatch.service.ts), the backend offers it to every
   * available online rider at once. These knobs shape that auction:
   *
   *   DISPATCH_OFFER_TTL_SECONDS  how long one offer round stays live in the
   *                               rider app (the Accept countdown). A rider who
   *                               rejects sees the job again on the NEXT round.
   *                               The first rider who Accepts inside the
   *                               window claims the order atomically
   *                               (accept_rider_order SQL function).
   *   DISPATCH_RETRY_SECONDS      how long to wait before a NEW offer round is
   *                               broadcast (retry after silence / rejects).
   *   DISPATCH_SWEEP_SECONDS      how often the background sweeper scans the
   *                               pool of ready orders.
   *   DISPATCH_ADMIN_ALERT_MINUTES  when NO rider is online, the admin team is
   *                               re-alerted at most once per this interval so
   *                               an unstaffed shift is visible but never spams.
   */
  DISPATCH_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(40),
  DISPATCH_RETRY_SECONDS: z.coerce.number().int().positive().default(45),
  DISPATCH_SWEEP_SECONDS: z.coerce.number().int().positive().default(15),
  DISPATCH_ADMIN_ALERT_MINUTES: z.coerce.number().int().positive().default(3),

  // --- Google Sign-In (customer accounts only) -------------------------------
  /**
   * OAuth client ID the app sends to Google. This is a **Web** OAuth client:
   * `expo-auth-session` runs the consent screen in a browser session, so the
   * ID token audience (`aud`) is the web client ID.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  /**
   * Extra client IDs that are also acceptable as an ID token audience, comma
   * separated. Needed when the app is later built as a native/dev-client app,
   * where Google issues the token for the iOS or Android client ID instead.
   */
  GOOGLE_ALLOWED_CLIENT_IDS: z.string().optional(),

  // --- Bootstrap admin (created/verified on first boot) ----------------------
  /**
   * The single admin account that bootstraps the deployment. Required, with no
   * fallback: a misconfigured environment fails fast rather than silently
   * creating a guessable account. Set to niazkhan4371@gmail.com in production.
   */
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email address'),
  /**
   * Contact phone stored on the admin account. Optional; when blank no phone
   * lookup is performed during bootstrap.
   */
  ADMIN_PHONE: z.string().default(''),
  /**
   * Bootstrap admin password. Must be at least 20 characters. It is read only
   * from the environment — never committed, hardcoded, or logged. Rotate it
   * with `npm run admin:password`.
   */
  ADMIN_PASSWORD: z.string().min(20, 'ADMIN_PASSWORD must be at least 20 characters'),
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
// Exported values used across the backend.
export const env = { ...data };

export const isProduction = env.NODE_ENV === 'production';

export const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

/** Public base URL of this API, always without a trailing slash. */
export const publicApiUrl = (env.PUBLIC_API_URL || `http://localhost:${env.PORT}`).replace(
  /\/+$/,
  '',
);

export const smtpConfigured = Boolean(
  env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM_EMAIL,
);

/** Optional email-link target; empty means "use the Supabase Site URL". */
export const authEmailRedirectUrl = env.AUTH_EMAIL_REDIRECT_URL.trim();

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
export const easypaisaFullyConfigured = Boolean(
  easypaisaConfigured && env.EASYPAISA_ACCOUNT_NUMBER,
);

export const jazzcashConfigured = Boolean(
  env.JAZZCASH_MERCHANT_ID && env.JAZZCASH_PASSWORD && env.JAZZCASH_INTEGRITY_SALT,
);

/**
 * Demo payments are OFF unless explicitly switched on in the server env.
 * Deliberately server-side only: the client cannot enable demo mode.
 */
export const demoPaymentsEnabled = env.DEMO_PAYMENTS_ENABLED === 'true';

/**
 * Direct/manual transfer methods ("Direct Bank Transfer (UBL)" and the manual
 * Easypaisa/JazzCash transfer options) are ON by default; deployments can hide
 * them with MANUAL_PAYMENTS_ENABLED=false. Server-side only, exactly like the
 * demo switch: the client cannot enable something the backend did not decide.
 */
export const manualPaymentsEnabled = env.MANUAL_PAYMENTS_ENABLED === 'true';

/**
 * Every client ID whose ID tokens this backend will accept. Verification is a
 * hard requirement: an unconfigured deployment must never fall back to trusting
 * an unverified token, so the sign-in route reports "not configured" instead.
 */
export const googleClientIds = [
  env.GOOGLE_CLIENT_ID,
  ...(env.GOOGLE_ALLOWED_CLIENT_IDS ?? '').split(','),
]
  .map((v) => (v ?? '').trim())
  .filter((v) => v.length > 0);

export const googleAuthConfigured = googleClientIds.length > 0;
