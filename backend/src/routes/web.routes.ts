// ============================================================
// Swat City Backend - site-root operational endpoints
//
// The password-reset flow is mail-OTP only: the app asks for a reset, the
// backend emails a 6-digit code, and the new password is set in-app. There are
// no reset links, so the old landing page and the Android/iOS app-link
// association files that existed only to open that link have been removed.
//
// This router now holds just the machine-readable integration report, served at
// the site root so a deploy can check it without going through /api.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { env, isProduction, smtpConfigured } from '../config/env';

const router = Router();

/** Machine-readable integration report, handy during a deploy. */
router.get('/integration-status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      environment: isProduction ? 'production' : 'development',
      emailOtp: {
        // Every login / registration / reset code is generated and delivered
        // by Supabase Auth (its SMTP is configured in the dashboard).
        enabled: true,
        provider: 'supabase-auth',
      },
      // Credentials themselves are never exposed.
      services: {
        supabase: 'configured',
        storage: env.SUPABASE_STORAGE_BUCKET || 'swat-city',
        smtp: smtpConfigured ? 'configured (optional notices)' : 'missing (optional)',
      },
    },
  });
});

export default router;
