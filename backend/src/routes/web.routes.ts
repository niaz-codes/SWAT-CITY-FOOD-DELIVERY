// ============================================================
// Swat City Backend - Reset landing page + app-link association files
//
// The password-reset email links to an HTTPS URL so it works in any mail
// client and survives link scanners. The token travels in the URL FRAGMENT
// (`#token=...`), which browsers never send to the server, so it never lands in
// nginx / proxy / access logs.
//
//  GET /reset-password                     branded landing page
//  GET /.well-known/assetlinks.json        Android App Links verification
//  GET /.well-known/apple-app-site-association   iOS Universal Links
//
// Set ANDROID_APP_SHA1 / IOS_APPLE_TEAM_ID (see env) to activate the OS-level
// "link opens the app directly" behaviour.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { env, isProduction } from '../config/env';

const router = Router();

const ANDROID_PACKAGE = 'com.swatcity.delivery';
const IOS_BUNDLE_ID = 'com.swatcity.delivery';

/**
 * SHA-1 fingerprints of the certificates that may sign the release build.
 * Get them from Google Play Console > App integrity > App signing (Play
 * App Signing cert) AND from your upload keystore, comma separated.
 */
/**
 * Android signing certificate fingerprints allowed to claim the app links.
 *
 * Digital Asset Links accept **SHA-256** only - `sha256_cert_fingerprints` is the
 * only field Android reads, so a SHA-1 entry silently fails verification and the
 * reset link opens the browser instead of the app. SHA-1 is still accepted here
 * because the debug keystore is occasionally wired up for local testing, and
 * because `ANDROID_APP_SHA1` is what Google Play Console's App integrity screen
 * shows for the upload key. Supply whichever you have; set ANDROID_APP_SHA256 for
 * the release certificate.
 */
function parseFingerprints(...vars: (string | undefined)[]): string[] {
  return vars
    .flatMap((v) => (v ?? '').split(','))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

const androidSha256Fingerprints = parseFingerprints(process.env.ANDROID_APP_SHA256);
const androidSha1Fingerprints = parseFingerprints(process.env.ANDROID_APP_SHA1);

/**
 * Asset Links will not accept a SHA-1 value in `sha256_cert_fingerprints`, so
 * only real 64-hex-char SHA-256 entries are emitted. If the operator only
 * configured SHA-1 the array is intentionally empty rather than wrong.
 */
const assetLinkFingerprints = androidSha256Fingerprints.filter((fp) => /^[0-9A-F]{64}$/.test(fp));

const appleTeamId = (process.env.IOS_APPLE_TEAM_ID ?? '').trim();

/**
 * Verbatim copy of the landing page. Inline CSS keeps it dependency-free and
 * makes the "Open in app" handoff work without any external request.
 */
function landingPage(tokenInHash: boolean): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset your Swat City password</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px 16px;background:#F5F8F7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0F1A19}
  .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #E2E8E7;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(11,85,78,.10)}
  .head{background:linear-gradient(135deg,#0E9488,#0B554E);padding:28px 28px 24px;text-align:center}
  .brand{font-size:21px;font-weight:800;color:#fff;letter-spacing:.2px}
  .tag{font-size:13px;color:rgba(255,255,255,.85);margin-top:4px}
  .body{padding:28px}
  h1{font-size:20px;line-height:1.3;margin:0 0 12px}
  p{font-size:15px;line-height:1.65;color:#5B6B69;margin:0 0 14px}
  .btn{display:block;text-align:center;text-decoration:none;background:#0E9488;color:#fff;font-weight:700;font-size:16px;padding:15px 24px;border-radius:12px;margin:8px 0 0}
  .btn.ghost{background:#fff;color:#0E9488;border:1.5px solid #0E9488}
  .note{margin-top:22px;padding-top:18px;border-top:1px solid #E2E8E7;font-size:12px;line-height:1.6;color:#8A9998}
  .err{display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B42318;border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:16px}
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="brand">Swat City</div>
      <div class="tag">Food &middot; Rides &middot; Delivered with care</div>
    </div>
    <div class="body">
      <div class="err" id="err"></div>
      <h1>Reset your password</h1>
      <p id="lead">Tap the button below and the Swat City app will open straight on the
      screen where you choose a new password.</p>
      <a class="btn" id="open" href="#">Open Swat City app</a>
      <a class="btn ghost" id="copy" href="#" onclick="return false;">Copy reset link</a>
      <div class="note">
        This link is single-use and expires quickly. If you did not request a password
        reset you can safely close this page &mdash; your password has not changed.
      </div>
    </div>
  </div>

<script>
(function () {
  var token = '';
  var m = window.location.hash.match(/token=([^&]+)/);
  if (m) token = decodeURIComponent(m[1]);

  var err = document.getElementById('err');
  var open = document.getElementById('open');

  if (!token) {
    err.style.display = 'block';
    err.textContent = 'This reset link is missing its security token. Please request a new reset email from the app.';
    open.style.display = 'none';
    return;
  }

  // Custom scheme => cold-launches the app even without App Links configured.
  var deepLink = 'swatcity://reset-password?token=' + encodeURIComponent(token);
  open.href = deepLink;

  document.getElementById('copy').addEventListener('click', function () {
    var link = window.location.origin + '/reset-password#token=' + encodeURIComponent(token);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link);
    } else {
      var ta = document.createElement('textarea');
      ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    this.textContent = 'Copied!';
  });
})();
</script>
</body></html>`;
}

/** GET /reset-password — the landing page hit from the email. */
router.get('/reset-password', (_req: Request, res: Response) => {
  res.status(200).type('html').send(landingPage(true));
});

/**
 * Android App Links. Without the SHA-1 entries Android will open the browser
 * instead of the app, so keep this in sync with the release keystore.
 */
router.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
  if (assetLinkFingerprints.length === 0 && !isProduction) {
    // eslint-disable-next-line no-console
    console.warn(
      '[web] /.well-known/assetlinks.json has no SHA-256 fingerprints. ' +
        'Set ANDROID_APP_SHA256 to the Play App Signing certificate SHA-256, ' +
        'otherwise the reset link will open the browser instead of the app.',
    );
  }

  res.type('application/json').json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: assetLinkFingerprints,
      },
    },
  ]);
});

/** iOS Universal Links (AASA). */
router.get('/.well-known/apple-app-site-association', (_req: Request, res: Response) => {
  res.type('application/json').json({
    applinks: {
      apps: [],
      details: [
        {
          appID: appleTeamId ? `${appleTeamId}.${IOS_BUNDLE_ID}` : `TEAMID.${IOS_BUNDLE_ID}`,
          components: [
            { '/': '/reset-password*', comment: 'Password reset deep link' },
          ],
        },
      ],
    },
  });
});

/** Machine-readable integration report, handy during a deploy. */
router.get('/integration-status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      environment: isProduction ? 'production' : 'development',
      passwordReset: {
        enabled: Boolean(env.BREVO_SMTP_USER && env.BREVO_SMTP_PASS && env.BREVO_FROM_EMAIL),
        ttlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      },
      // Credentials themselves are never exposed.
      services: {
        mongodb: 'configured',
        cloudinary: 'configured',
        brevo: Boolean(env.BREVO_SMTP_USER && env.BREVO_SMTP_PASS && env.BREVO_FROM_EMAIL)
          ? 'configured'
          : 'missing',
        firebase: env.FIREBASE_SERVICE_ACCOUNT_JSON ||
          env.FIREBASE_SERVICE_ACCOUNT_PATH ||
          env.FIREBASE_PRIVATE_KEY
          ? 'configured'
          : 'missing',
      },
      appLinks: {
        // Asset Links verification only succeeds with SHA-256 entries, so that
        // is the flag that actually matters for the reset deep link.
        androidSha256FingerprintsConfigured: assetLinkFingerprints.length > 0,
        androidSha1FingerprintsConfigured: androidSha1Fingerprints.length > 0,
        appleTeamIdConfigured: Boolean(appleTeamId),
      },
    },
  });
});

export default router;