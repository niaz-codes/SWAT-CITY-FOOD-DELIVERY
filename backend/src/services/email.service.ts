// ============================================================
// Swat City Backend - Brevo transactional email (SMTP)
// Password reset / security mails. Credentials live only in backend env vars.
// Nothing sensitive (SMTP password or reset token) is ever logged.
// ============================================================

import nodemailer, { type Transporter } from 'nodemailer';
import { env, brevoConfigured } from '../config/env';

let transporter: Transporter | null = null;
let verified = false;

const BRAND = {
  name: env.BREVO_FROM_NAME || 'Swat City Food Delivery',
  teal: '#0E9488',
  deepTeal: '#0B554E',
  ink: '#0F1A19',
  muted: '#5B6B69',
  border: '#E2E8E7',
  bg: '#F5F8F7',
};

function getTransport(): Transporter | null {
  if (!brevoConfigured) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: env.BREVO_SMTP_PORT || 587,
    // 587 = STARTTLS. Never `secure: true` unless you move to port 465.
    secure: (env.BREVO_SMTP_PORT || 587) === 465,
    requireTLS: true,
    auth: {
      user: env.BREVO_SMTP_USER,
      pass: env.BREVO_SMTP_PASS,
    },
    // Generous but bounded so a hung SMTP socket cannot stall a request.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 25_000,
  });

  return transporter;
}

/**
 * Confirms Brevo accepts our credentials + the from address is verified.
 * Called once at boot; a failure downgrades to console-only logging.
 */
export async function verifyEmailTransport(): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  try {
    await t.verify();
    verified = true;
    // eslint-disable-next-line no-console
    console.log('[email] Brevo SMTP connection verified');
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[email] Brevo SMTP verification failed:', (error as Error).message);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return brevoConfigured;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function layout(opts: { title: string; preheader: string; ctaLabel?: string; ctaUrl?: string; body: string }): string {
  const { title, preheader, ctaLabel, ctaUrl, body } = opts;

  const button =
    ctaLabel && ctaUrl
      ? `<tr>
          <td style="padding:8px 32px 28px;">
            <a href="${ctaUrl}"
               style="display:inline-block;background:${BRAND.teal};color:#ffffff;text-decoration:none;
                      font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                      font-size:16px;font-weight:700;padding:14px 32px;border-radius:12px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>`
      : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BRAND.border};">

        <tr>
          <td style="background:linear-gradient(135deg,${BRAND.teal},${BRAND.deepTeal});padding:28px 32px;text-align:center;">
            <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                        font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.2px;">
              Swat City
            </div>
            <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                        font-size:13px;color:rgba(255,255,255,.85);margin-top:4px;">
              Food &middot; Rides &middot; Delivered with care
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                       font-size:21px;line-height:1.3;color:${BRAND.ink};">
              ${title}
            </h1>
            <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                        font-size:15px;line-height:1.65;color:${BRAND.muted};">
              ${body}
            </div>
          </td>
        </tr>

        ${button}

        <tr>
          <td style="padding:0 32px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                     font-size:12px;line-height:1.6;color:#8A9998;">
            ${ctaUrl ? 'The button above will open the reset screen inside the Swat City app.' : ''}
            If the button does not work, copy this link into your browser:<br>
            ${ctaUrl ? `<span style="word-break:break-all;color:${BRAND.teal};">${ctaUrl}</span>` : ''}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px;background:${BRAND.bg};border-top:1px solid ${BRAND.border};
                     font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                     font-size:11px;line-height:1.6;color:#8A9998;text-align:center;">
            &copy; ${new Date().getFullYear()} ${BRAND.name}. Saidu Sharif, Swat, Pakistan.<br>
            You are receiving this because a password reset was requested for your account.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const shell = (html: string, text: string) => ({
  html,
  text,
});

// ---------------------------------------------------------------------------
// Public send helpers
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(opts: {
  to: string;
  name?: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  const t = getTransport();
  if (!t) {
    // eslint-disable-next-line no-console
    console.warn('[email] Brevo not configured — password reset email not sent');
    return false;
  }

  const greeting = opts.name ? `Hi ${opts.name},` : 'Hi there,';

  const { html, text } = shell(
    layout({
      title: 'Reset your Swat City password',
      preheader: `This secure link expires in ${opts.expiresInMinutes} minutes.`,
      ctaLabel: 'Reset password',
      ctaUrl: opts.resetUrl,
      body: `
        <p style="margin:0 0 14px;">${greeting}</p>
        <p style="margin:0 0 14px;">
          We received a request to reset the password for your Swat City account.
          Tap the button below to choose a new one.
        </p>
        <p style="margin:0 0 14px;">
          This link is valid for <strong>${opts.expiresInMinutes} minutes</strong> and can only be used once.
        </p>
        <p style="margin:0;">
          If you did not request this, you can safely ignore this email &mdash;
          your password will stay exactly as it is.
        </p>`,
    }),
    [
      greeting,
      '',
      'We received a request to reset the password for your Swat City account.',
      `Open this link to choose a new one (valid for ${opts.expiresInMinutes} minutes, single use):`,
      opts.resetUrl,
      '',
      "If you didn't request this, ignore this email - your password stays unchanged.",
    ].join('\n'),
  );

  try {
    await t.sendMail({
      from: { name: BRAND.name, address: env.BREVO_FROM_EMAIL as string },
      to: opts.to,
      subject: 'Reset your Swat City password',
      ...shell(html, text),
    });
    // Deliberately logs the recipient + subject only, never the reset URL.
    // eslint-disable-next-line no-console
    console.log(`[email] password reset mail sent to ${maskEmail(opts.to)}`);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[email] password reset send failed:', (error as Error).message);
    return false;
  }
}

export async function sendPasswordChangedEmail(opts: {
  to: string;
  name?: string;
}): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;

  const greeting = opts.name ? `Hi ${opts.name},` : 'Hi there,';

  const { html, text } = shell(
    layout({
      title: 'Your password was changed',
      preheader: 'A successful security notice for your Swat City account.',
      body: `
        <p style="margin:0 0 14px;">${greeting}</p>
        <p style="margin:0 0 14px;">
          The password on your Swat City account was just changed successfully.
        </p>
        <p style="margin:0;">
          If this was not you, reset your password immediately and contact support.
        </p>`,
    }),
    [
      greeting,
      '',
      'The password on your Swat City account was just changed successfully.',
      "If this was not you, reset your password immediately and contact support.",
    ].join('\n'),
  );

  try {
    await t.sendMail({
      from: { name: BRAND.name, address: env.BREVO_FROM_EMAIL as string },
      to: opts.to,
      subject: 'Your Swat City password was changed',
      ...shell(html, text),
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[email] password-changed send failed:', (error as Error).message);
    return false;
  }
}

/** Masks an address so logs stay safe while remaining useful. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export const emailTemplates = { layout, shell };