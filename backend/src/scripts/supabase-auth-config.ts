// ============================================================
// Swat City Backend - Apply Supabase Auth OTP settings
//
// One-off maintainer tool. It writes the settings that live in the Supabase
// project (they cannot be set from application code):
//
//   - "Confirm signup" + "Magic Link" templates that SHOW the 6-digit code
//     (`{{ .Token }}`) instead of a one-time confirmation link
//   - Site URL + allowed Redirect URLs, so a link can never fall back to
//     http://localhost:3000
//   - 6-digit codes with a 10 minute expiry
//
// Usage:
//   1. Create a personal access token:
//      https://supabase.com/dashboard/account/tokens
//   2. Add it to backend/.env (never commit it):
//      SUPABASE_ACCESS_TOKEN=sbp_...
//   3. Run: npm run auth:config
//   4. Delete the token from .env when done — it is only needed for this run.
//
// Optional overrides (backend/.env):
//   SUPABASE_PROJECT_REF   project ref; derived from SUPABASE_URL by default
//   SUPABASE_SITE_URL      Site URL; defaults to PUBLIC_API_URL when https,
//                          otherwise the Railway deployment
// ============================================================

import 'dotenv/config';

const API_BASE = 'https://api.supabase.com';
const OTP_TTL_SECONDS = 600;
const OTP_LENGTH = 6;
const DEFAULT_SITE_URL = 'https://backend-production-73f5.up.railway.app';

const CODE_BLOCK =
  '<p style="font-size: 30px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">{{ .Token }}</p>';

const CONFIRMATION_TEMPLATE = [
  '<h2>Confirm your Swat City Food Delivery email</h2>',
  '<p>Enter this code in the app to verify your email address:</p>',
  CODE_BLOCK,
  '<p>This code expires in 10 minutes. If you did not sign up for Swat City Food Delivery, you can ignore this email.</p>',
].join('\n');

const MAGIC_LINK_TEMPLATE = [
  '<h2>Your Swat City Food Delivery verification code</h2>',
  '<p>Enter this code in the app to continue:</p>',
  CODE_BLOCK,
  '<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>',
].join('\n');

function fail(message: string): never {
  console.error(`[auth-config] ${message}`);
  process.exit(1);
}

function resolveProjectRef(): string {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.SUPABASE_URL?.trim() ?? '';
  const match = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  if (!match?.[1]) {
    fail('Could not derive the project ref. Set SUPABASE_PROJECT_REF or a valid SUPABASE_URL.');
  }
  return match[1];
}

function resolveSiteUrl(): string {
  const explicit = process.env.SUPABASE_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const publicUrl = process.env.PUBLIC_API_URL?.trim() ?? '';
  if (publicUrl.startsWith('https://')) return publicUrl.replace(/\/+$/, '');

  return DEFAULT_SITE_URL;
}

function splitList(value: unknown): string[] {
  return String(value ?? '')
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function supabaseApi(
  method: 'GET' | 'PATCH',
  path: string,
  token: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`${method} ${path} failed (HTTP ${response.status}): ${text.slice(0, 600)}`);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function hasToken(template: unknown): boolean {
  return String(template ?? '').includes('{{ .Token }}');
}

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN is not set. Create one at ' +
        'https://supabase.com/dashboard/account/tokens and add it to backend/.env, ' +
        'then run `npm run auth:config` again.',
    );
  }

  const ref = resolveProjectRef();
  const siteUrl = resolveSiteUrl();
  const configPath = `/v1/projects/${ref}/config/auth`;

  const current = await supabaseApi('GET', configPath, token);
  const existingRedirects = splitList(current.uri_allow_list);
  const redirects = Array.from(
    new Set([
      ...existingRedirects,
      `${siteUrl}/**`,
      `${siteUrl}/auth/callback`,
      // Mobile deep link declared in app.json (`expo.scheme`).
      'swatcity://**',
      // Expo web (dev server) and the historical localhost:3000 default.
      'http://localhost:8081/**',
      'http://localhost:19006/**',
      'http://localhost:3000/**',
    ]),
  );

  console.log('[auth-config] project:', ref);
  console.log('[auth-config] current site URL:', String(current.site_url ?? ''));
  console.log('[auth-config] current OTP expiry (s):', String(current.mailer_otp_exp ?? ''));
  console.log('[auth-config] current OTP length:', String(current.mailer_otp_length ?? ''));
  console.log(
    '[auth-config] confirmation template shows code:',
    hasToken(current.mailer_templates_confirmation_content),
  );
  console.log(
    '[auth-config] magic-link template shows code:',
    hasToken(current.mailer_templates_magic_link_content),
  );
  if (current.mailer_autoconfirm === true) {
    console.warn(
      '[auth-config] WARNING: mailer_autoconfirm is ON. New users are confirmed ' +
        'without proving mailbox access. Turn it off in Authentication -> Providers -> Email.',
    );
  }

  await supabaseApi('PATCH', configPath, token, {
    site_url: siteUrl,
    uri_allow_list: redirects.join(','),
    mailer_otp_exp: OTP_TTL_SECONDS,
    mailer_otp_length: OTP_LENGTH,
    mailer_templates_confirmation_content: CONFIRMATION_TEMPLATE,
    mailer_templates_magic_link_content: MAGIC_LINK_TEMPLATE,
    mailer_subjects_confirmation: 'Your Swat City Food Delivery verification code',
    mailer_subjects_magic_link: 'Your Swat City Food Delivery verification code',
  });

  console.log('[auth-config] applied.');
  console.log('[auth-config] site URL:', siteUrl);
  console.log('[auth-config] redirect URLs:', redirects.join(', '));
  console.log(
    `[auth-config] codes: ${OTP_LENGTH} digits, ${OTP_TTL_SECONDS / 60} minute expiry`,
  );
  console.log('[auth-config] templates: code-only ({{ .Token }}), no confirmation link');
  console.log('[auth-config] Delete SUPABASE_ACCESS_TOKEN from backend/.env now.');
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
