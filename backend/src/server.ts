import http from 'http';
import { app, env } from './app';
import { connectDB, disconnectDB } from './config/db';
import { smtpConfigured } from './config/env';
import { describeExpoPushStatus } from './config/expoPush';
import { pingSupabase } from './config/supabase';
import { initSocket } from './sockets';
import { ensureAdmin } from './services/seed.service';
import { ensureDefaultSettings } from './services/settings.service';
import { startPaymentExpirySweeper } from './services/paymentSweeper';

async function start(): Promise<void> {
  await connectDB();

  // Idempotent boot-time bootstrap: the single admin account and the app
  // settings. No demo business data is created.
  await ensureAdmin();
  await ensureDefaultSettings();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[server] Swat City Food Delivery backend listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  // Surface integration health in the deploy logs so a misconfigured env var is
  // obvious immediately rather than at the first push failure. Never blocks boot.
  void reportIntegrations();

  // Abandoned wallet payments would otherwise leave unpaid orders sitting in the
  // restaurant and rider queues indefinitely.
  const stopSweeper = startPaymentExpirySweeper();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} received — shutting down gracefully...`);
    stopSweeper();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Safety net if connections hang
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[server] unhandledRejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    // eslint-disable-next-line no-console
    console.error('[server] uncaughtException:', error);
  });
}

/** One-line status per integration. Logs configuration state only, no secrets. */
async function reportIntegrations(): Promise<void> {
  const expoPush = describeExpoPushStatus();
  const supabaseOk = await pingSupabase();

  const lines = [
    `[integrations] supabase  : ${supabaseOk ? 'ok' : 'MISSING/UNREACHABLE'}`,
    // Delivery for every OTP email is configured in the Supabase dashboard
    // (Authentication -> Emails -> SMTP Settings), not in this process.
    `[integrations] email otp : supabase auth (check SMTP settings in the dashboard)`,
    `[integrations] smtp      : ${smtpConfigured ? 'configured (password-changed notices)' : 'not configured (optional)'}`,
    `[integrations] expopush  : ${expoPush.enabled ? 'enabled' : 'DISABLED'}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  if (!expoPush.enabled || !supabaseOk) {
    // eslint-disable-next-line no-console
    console.warn('[integrations] some services are not configured — see backend/.env.example');
  }
}

void start();
