import http from 'http';
import { app, env } from './app';
import { connectDB, disconnectDB } from './config/db';
import { describeFirebaseStatus } from './config/firebase';
import { describeExpoPushStatus } from './config/expoPush';
import { cloudinaryConfigured } from './config/cloudinary';
import { verifyEmailTransport } from './services/email.service';
import { initSocket } from './sockets';
import { ensureAdmin, ensureDefaultSettings } from './services';
import { startPaymentExpirySweeper } from './services/paymentSweeper';

async function start(): Promise<void> {
  await connectDB();

  // Idempotent boot-time bootstrap: seeded admin + app settings.
  await ensureAdmin();
  await ensureDefaultSettings();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Swat City backend listening on port ${env.PORT} (${env.NODE_ENV})`);
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
  const firebase = describeFirebaseStatus();
  const expoPush = describeExpoPushStatus();

  const lines = [
    `[integrations] mongodb    : connected`,
    `[integrations] cloudinary: ${cloudinaryConfigured ? 'configured' : 'MISSING'}`,
    `[integrations] brevo     : ${(await verifyEmailTransport()) ? 'smtp ok' : 'SMTP NOT VERIFIED'}`,
    // Expo Push is the primary transport for the Expo Go app; FCM only serves
    // legacy FCM tokens, so its absence is informational, not a failure.
    `[integrations] expopush  : ${expoPush.enabled ? 'enabled' : 'DISABLED'}`,
    `[integrations] fcm       : ${
      !firebase.configured ? 'not configured (FCM tokens unsupported)' : firebase.ready ? 'ready' : 'INIT FAILED'
    }`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  if (!expoPush.enabled || !cloudinaryConfigured) {
    // eslint-disable-next-line no-console
    console.warn('[integrations] some services are not configured — see backend/.env.example');
  }
}

void start();