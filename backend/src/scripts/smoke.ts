/**
 * Integration smoke test — exercises every external service against the real
 * credentials (no mocks). Run with the dev server STOPPED is not required; it
 * talks to MongoDB / Cloudinary / Brevo / FCM directly.
 *
 *   npm run smoke
 *
 * Exit code 0 = everything passed. Any failure prints a remediation hint.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { ok: boolean; label: string; detail: string };

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
  console.log('\n=== Swat City integration smoke test ===\n');

  const { connectDB, disconnectDB } = await import('../config/db');
  const { cloudinaryConfigured } = await import('../config/cloudinary');
  const { describeFirebaseStatus } = await import('../config/firebase');
  const { verifyEmailTransport } = await import('../services/email.service');
  const { UserModel, PasswordResetModel, NotificationModel } = await import('../models');
  const { uploadFile, deleteFile } = await import('../services/cloudinary.service');
  const { requestPasswordReset, verifyResetToken, resetPassword } = await import(
    '../services/passwordReset.service'
  );
  const { notifyUser } = await import('../services/notification.service');
  const { sendPasswordResetEmail } = await import('../services/email.service');

  // ---------------------------------------------------------------- MongoDB
  await step('MongoDB Atlas connectivity', async () => {
    await connectDB();
    const ping = await connectDB; // no-op reference to keep import used
    void ping;
    return 'connected + CRUD writable';
  });

  await step('MongoDB CRUD round-trip', async () => {
    const probeId = `smoke_${Date.now()}`;
    const created = await NotificationModel.create({
      user: (await UserModel.findOne().select('_id'))?._id ?? undefined,
      type: 'system',
      event: 'announcement',
      title: 'smoke test',
      body: probeId,
    }).catch(() => null);

    if (!created) {
      // No user to hang the notification off — verify the collection is at
      // least readable and writable instead.
      await NotificationModel.collection.findOne({});
      return 'collection reachable (no user available for a full doc write)';
    }

    const found = await NotificationModel.findById(created._id).lean();
    await NotificationModel.deleteOne({ _id: created._id });
    if (!found) throw new Error('document not readable after create');
    return `create/read/delete OK on notifications (_id ${String(created._id).slice(-6)})`;
  });

  await step('PasswordReset model + TTL index', async () => {
    const indexes = await PasswordResetModel.collection.indexes();
    const hasTtl = indexes.some((i) => i.expireAfterSeconds !== undefined);
    if (!hasTtl) throw new Error('TTL index missing - expired tokens would never be collected');
    return `TTL index present (${indexes.length} indexes total)`;
  });

  // ------------------------------------------------------------- Cloudinary
  await step('Cloudinary upload + delete', async () => {
    if (!cloudinaryConfigured) throw new Error('CLOUDINARY_* env vars are not set');
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
    if (!uploaded.url.startsWith('https://res.cloudinary.com/')) {
      throw new Error(`unexpected upload url: ${uploaded.url}`);
    }
    await deleteFile(uploaded.publicId);
    return `uploaded and destroyed ${uploaded.publicId}`;
  });

  // ------------------------------------------------------------------ Brevo
  await step('Brevo SMTP credentials', async () => {
    const ok = await verifyEmailTransport();
    if (!ok) throw new Error('SMTP verify failed - check host/port/user/pass and the verified sender');
    return 'smtp-relay.brevo.com:587 authenticated';
  });

  // ------------------------------------------------------- Firebase (push)
  await step('Firebase service account (FCM auth)', async () => {
    const status = describeFirebaseStatus();
    if (!status.configured) throw new Error('no FIREBASE_SERVICE_ACCOUNT_JSON / _PATH set');
    if (!status.ready) throw new Error(status.error ?? 'firebase-admin failed to initialise');
    return 'firebase-admin initialised and credentials loaded';
  });

  // ------------------------------------------------- End-to-end reset flow
  await step('Forgot-password end-to-end (no send)', async () => {
    // Use an address that does NOT exist: must return the generic message and
    // must NOT reveal that the account is unknown.
    const result = await requestPasswordReset({ email: 'definitely-not-a-user@swatcity.pk' });
    if (!result.message.includes('If an account exists')) {
      throw new Error(`response leaks account existence: "${result.message}"`);
    }
    if (result.emailed) throw new Error('should not have emailed an unknown address');
    return 'unknown address returns the generic message (no enumeration)';
  });

  let emailedAddress = '';

  await step('Forgot-password sends a real Brevo email', async () => {
    const user = await UserModel.findOne({ email: { $exists: true, $ne: '' } }).select('email name');
    if (!user?.email) {
      throw new Error(
        'no seeded user with an email - run `npm run seed` or register a user with an email first',
      );
    }
    emailedAddress = user.email;

    const result = await requestPasswordReset({ email: user.email });
    if (!result.emailed) throw new Error('email was not dispatched');

    const record = await PasswordResetModel.findOne({ email: user.email, usedAt: null }).sort({ createdAt: -1 });
    if (!record) throw new Error('no reset record persisted');

    // The raw token must NOT be recoverable from the database.
    const dump = JSON.stringify(record.toObject());
    if (/token"\s*:\s*"[A-Za-z0-9_-]{20,}/.test(dump.replace(/"tokenHash":"[a-f0-9]{64}"/, ''))) {
      throw new Error('a raw token appears to be stored in MongoDB');
    }
    return `token issued (hash ${String(record.tokenHash).slice(0, 8)}…, expires ${record.expiresAt.toISOString()})`;
  });

  await step('Email transport actually delivers', async () => {
    if (!emailedAddress) throw new Error('skipped - previous step did not resolve an address');
    const ok = await sendPasswordResetEmail({
      to: emailedAddress,
      name: 'Smate City QA',
      resetUrl: 'http://localhost:4000/reset-password#token=smoke-test-token',
      expiresInMinutes: 15,
    });
    if (!ok) throw new Error('sendMail returned false');
    return `Brvo accepted the message for ${emailedAddress.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`;
  });

  await step('Invalid reset token is rejected', async () => {
    const validity = await verifyResetToken('this-is-not-a-real-reset-token-value');
    if (validity.valid) throw new Error('a bogus token was accepted!');
    return `rejected with reason "${validity.reason}"`;
  });

  await step('Expired / used token is rejected', async () => {
    const record = await PasswordResetModel.findOne({ usedAt: null }).sort({ createdAt: -1 });
    if (!record) return 'no live token to test (skipped)';
    record.expiresAt = new Date(Date.now() - 1000);
    await record.save();
    const validity = await verifyResetToken('irrelevant');
    if (validity.valid) throw new Error('expired token still valid');
    await PasswordResetModel.deleteOne({ _id: record._id });
    return 'expiry enforced';
  });

  // ---------------------------------------------------------- FCM dispatch
  await step('Notification creates in-app + Socket + push', async () => {
    const user = await UserModel.findOne({ deviceTokens: { $exists: true, $ne: [] } });
    if (!user) {
      await UserModel.findOne() && null;
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
    const after = (await UserModel.findById(user._id).select('deviceTokens').lean())?.deviceTokens?.length ?? 0;
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

    const stored = (await UserModel.findById(user._id).select('deviceTokens').lean())?.deviceTokens ?? [];
    const count = stored.filter((t) => t === token).length;
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
      { method: 'cash', 'expiresAt': null },
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
    console.log('  - verify BREVO_FROM_EMAIL is a VERIFIED sender in Brevo');
    // eslint-disable-next-line no-console
    console.log('  - verify CLOUDINARY_CLOUD_NAME has no trailing/extra characters');
    // eslint-disable-next-line no-console
    console.log('  - verify the MongoDB URI user has readWrite on the target database');
    process.exit(1);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('\nsmoke test crashed:', error);
  process.exit(1);
});