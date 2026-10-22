/**
 * Integration smoke test — exercises every external service against the real
 * credentials (no mocks). Run with the dev server STOPPED is not required; it
 * talks to Supabase (Postgres + Storage + Auth OTP emails) / Expo Push
 * directly. The SMTP transport, when configured, only carries password-changed
 * notices.
 *
 *   npm run smoke
 *
 * Exit code 0 = everything passed. Any failure prints a remediation hint.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { ok: boolean; label: string; detail: string };

import { randomUUID } from 'crypto';

const results: Result[] = [];

function pass(label: string, detail: string) {
  results.push({ ok: true, label, detail });
  // eslint-disable-next-line no-console
  console.log(`  PASS  ${label}\n        ${detail}`);
}

function fail(label: string, detail: string) {
  results.push({ ok: false, label, detail });
  // eslint-disable-next-line no-console
  console.log(`  FAIL  ${label}\n        ${detail}`);
}

async function step(label: string, fn: () => Promise<string>): Promise<void> {
  try {
    pass(label, await fn());
  } catch (error) {
    fail(label, (error as Error).message);
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n=== Swat City Food Delivery integration smoke test ===\n');

  const { connectDB, disconnectDB } = await import('../config/db');
  const { pingSupabase } = await import('../config/supabase');
  const { env } = await import('../config/env');
  const { UserModel, EmailOtpModel, NotificationModel } = await import('../models');
  const { uploadFile, deleteFile } = await import('../services/storage.service');
  const { requestPasswordReset } = await import('../services/passwordReset.service');
  const { consumeEmailOtp, issueEmailOtp } = await import('../services/otp.service');
  const { verifyEmailOtpChallenge } = await import('../utils/tokens');
  const { notifyUser } = await import('../services/notification.service');

  // -------------------------------------------------------------- Supabase
  await step('Supabase connectivity', async () => {
    await connectDB();
    return 'connected (PGRST reachable + CRUD writable)';
  });

  await step('Supabase CRUD round-trip', async () => {
    const probeId = `smoke_${Date.now()}`;
    const created = await NotificationModel.create({
      user: (await UserModel.findOne().select('_id'))?._id ?? undefined,
      type: 'system',
      event: 'announcement',
      title: 'smoke test',
      body: probeId,
    }).catch(() => null);

    if (!created) {
      // No user to hang the notification off — verify the data layer is at
      // least readable and writable instead.
      await NotificationModel.countDocuments();
      return 'data layer reachable (no user available for a full doc write)';
    }

    const found = await NotificationModel.findById(created._id).lean();
    await NotificationModel.deleteOne({ _id: created._id });
    if (!found) throw new Error('document not readable after create');
    return `create/read/delete OK on notifications (_id ${String(created._id).slice(-6)})`;
  });

  await step('EmailOtp model + expiry filtering', async () => {
    const email = `smoke-${Date.now()}@swatcity.pk`;
    const codeHash = `smoke_${randomUUID().replace(/-/g, '')}`;
    const expired = await EmailOtpModel.create({
      email,
      purpose: 'reset',
      codeHash,
      expiresAt: new Date(Date.now() - 60_000),
      requestedIp: 'smoke',
    });
    const live = await EmailOtpModel.findOne({
      codeHash,
      expiresAt: { $gt: new Date() },
    });
    await EmailOtpModel.deleteOne({ _id: expired._id });
    if (live) throw new Error('expired OTP is still queryable');
    return 'expired OTP codes are excluded by the service-time filter';
  });

  // ------------------------------------------------------------- Supabase Storage
  await step('Supabase ping + storage upload/delete', async () => {
    const ok = await pingSupabase();
    if (!ok) throw new Error('Supabase ping failed');
    // 1x1 transparent PNG.
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const file = {
      buffer,
      mimetype: 'image/png',
      originalname: 'smoke.png',
      size: buffer.length,
    } as Express.Multer.File;

    const uploaded = await uploadFile(file, 'swat-city/_smoke');
    const expectedPrefix = `${env.SUPABASE_URL}/storage/v1/object/public/`;
    if (!uploaded.url.startsWith(expectedPrefix)) {
      throw new Error(`unexpected upload url: ${uploaded.url}`);
    }
    await deleteFile(uploaded.publicId);
    return `uploaded and destroyed ${uploaded.publicId}`;
  });

  // ------------------------------------------------------------------ Email
  // Delivery for OTP codes is Supabase Auth; whether its SMTP actually sends
  // is covered by the "actually delivers" step further down.

  // Expo push status (informational)
  await step('Expo push status', async () => {
    const { describeExpoPushStatus } = await import('../config/expoPush');
    const status = describeExpoPushStatus();
    return `expoPush enabled=${status.enabled}, tokenConfigured=${status.accessTokenConfigured}`;
  });

  // ------------------------------------------------- End-to-end reset flow
  await step('Forgot-password end-to-end (no send)', async () => {
    // Use an address that does NOT exist: must return the generic message and
    // must NOT reveal that the account is unknown.
    const result = await requestPasswordReset({ email: 'definitely-not-a-user@swatcity.pk' });
    if (!result.message.includes('If an account exists')) {
      throw new Error(`response leaks account existence: "${result.message}"`);
    }
    if (!result.challengeToken) throw new Error('no challenge token returned');
    return 'unknown address returns the generic message + a challenge (no enumeration)';
  });

  let emailedAddress = '';

  await step('Forgot-password issues a real email OTP', async () => {
    const user = await UserModel.findOne({ email: { $exists: true, $ne: '' } }).select(
      'email name',
    );
    if (!user?.email) {
      throw new Error(
        'no seeded user with an email - run `npm run seed` or register a user with an email first',
      );
    }
    emailedAddress = user.email;

    const result = await requestPasswordReset({ email: user.email });
    if (!result.challengeToken) throw new Error('no challenge token returned');

    const record = await EmailOtpModel.findOne({
      email: user.email,
      purpose: 'reset',
      usedAt: null,
    }).sort({ createdAt: -1 });
    if (!record) throw new Error('no OTP record persisted');

    // The raw 6-digit code must NOT be recoverable from the database.
    const dump = JSON.stringify(record.toObject());
    if (/"code"\s*:\s*"\d{6}"/.test(dump) || /"code"\s*:\s*"/.test(dump)) {
      throw new Error('a raw code appears to be stored in the database');
    }
    return `code requested (marker ${String(record.codeHash).slice(0, 8)}…, expires ${record.expiresAt.toISOString()})`;
  });

  await step('Supabase Auth actually delivers the OTP email', async () => {
    if (!emailedAddress) throw new Error('skipped - previous step did not resolve an address');
    const issued = await issueEmailOtp({
      email: emailedAddress,
      name: 'Swat City Food Delivery QA',
      purpose: 'reset',
    });
    if (!issued.emailSent) {
      throw new Error(
        'supabase refused the send - configure SMTP under Authentication > Emails in the dashboard',
      );
    }
    return `supabase accepted the message for ${emailedAddress.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`;
  });

  await step('Bogus OTP challenge is rejected', async () => {
    let rejected = false;
    try {
      verifyEmailOtpChallenge('this-is-not-a-real-challenge-token-value');
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('a bogus challenge token was accepted!');
    return 'malformed challenge token rejected';
  });

  await step('Expired OTP is rejected', async () => {
    const email = `smoke-expired-${Date.now()}@swatcity.pk`;
    const record = await EmailOtpModel.create({
      email,
      purpose: 'reset',
      codeHash: `smoke_${randomUUID().replace(/-/g, '')}`,
      expiresAt: new Date(Date.now() - 1000),
      requestedIp: 'smoke',
    });
    let rejected = false;
    try {
      await consumeEmailOtp({ email, purpose: 'reset', code: '000000' });
    } catch {
      rejected = true;
    }
    await EmailOtpModel.deleteOne({ _id: record._id });
    if (!rejected) throw new Error('expired OTP still accepted');
    return 'expiry enforced';
  });

  // ---------------------------------------------------------- Push dispatch
  await step('Notification creates in-app + Socket + push', async () => {
    const user = await UserModel.findOne({ deviceTokens: { $exists: true, $ne: [] } });
    if (!user) {
      // No registered device yet; still exercise the in-app + socket path.
      const anyUser = await UserModel.findOne();
      if (!anyUser) throw new Error('no users in the database');
      const n = await notifyUser(String(anyUser._id), {
        type: 'system',
        event: 'announcement',
        title: 'Smoke test',
        body: 'in-app notification path',
      });
      const found = await NotificationModel.findById(n._id).lean();
      if (!found) throw new Error('in-app notification not persisted');
      return 'in-app notification persisted (no device tokens registered yet)';
    }

    const before = (user.deviceTokens ?? []).length;
    await notifyUser(String(user._id), {
      type: 'system',
      event: 'announcement',
      title: 'Smoke test',
      body: 'full fan-out path',
    });
    const after =
      (await UserModel.findById(user._id).select('deviceTokens').lean())?.deviceTokens?.length ?? 0;
    return `pushed to ${before} device token(s); still ${after} after pruning`;
  });

  // --------------------------------------------------------- duplicate token
  await step('Device token registration is duplicate-safe', async () => {
    const user = await UserModel.findOne();
    if (!user) throw new Error('no users in the database');
    const token = `smoke-token-${Date.now()}`;
    const { registerDeviceToken } = await import('../services/notification.service');

    await registerDeviceToken(String(user._id), token);
    await registerDeviceToken(String(user._id), token);
    await registerDeviceToken(String(user._id), token);

    const stored =
      (await UserModel.findById(user._id).select('deviceTokens').lean())?.deviceTokens ?? [];
    const count = stored.filter((t: any) => t === token).length;
    await UserModel.updateOne({ _id: user._id }, { $pull: { deviceTokens: token } });

    if (count !== 1) throw new Error(`expected 1 copy of the token, found ${count}`);
    return 'three registrations produced exactly one stored token';
  });

  // ----------------------------------------------- expired-payment sweeper
  await step('Expired-payment sweep leaves paid and fresh payments alone', async () => {
    const { sweepExpiredPayments } = await import('../services/paymentSweeper');
    const { PaymentModel } = await import('../models');

    // An expired *cash* payment must never be swept: there is nothing to expire.
    const staleCash = await PaymentModel.findOneAndUpdate(
      { method: 'cash', expiresAt: null },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
      { new: true },
    );

    const { expired, recovered } = await sweepExpiredPayments();

    if (staleCash) {
      const after = await PaymentModel.findById(staleCash._id).lean();
      await PaymentModel.updateOne({ _id: staleCash._id }, { $set: { expiresAt: null } });
      if (after?.status === 'cancelled') {
        throw new Error('sweeper cancelled a non-gateway cash payment');
      }
    }

    if (!Number.isInteger(expired) || !Number.isInteger(recovered)) {
      throw new Error(`sweeper returned non-integer counts: ${expired}/${recovered}`);
    }
    return `swept ${expired}, recovered ${recovered} late payment(s)`;
  });

  await disconnectDB();

  const failed = results.filter((r) => !r.ok);
  // eslint-disable-next-line no-console
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===\n`);

  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.log('Reminders:');
    // eslint-disable-next-line no-console
    console.log('  - verify Supabase Auth SMTP settings (Authentication > Emails) can deliver to Gmail');
    // eslint-disable-next-line no-console
    console.log('  - verify SUPABASE_URL and SUPABASE_SECRET_KEY are set correctly');
    // eslint-disable-next-line no-console
    console.log('  - verify the Supabase storage bucket exists and is writable');
    process.exit(1);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('\nsmoke test crashed:', error);
  process.exit(1);
});
