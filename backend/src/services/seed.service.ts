import { env } from '../config/env';
import { UserModel } from '../models';
import { hashPassword, verifyPassword } from '../utils/helpers';
import { getOrCreateWallet } from './wallet.service';

/** PII-safe label for logs. Never log the full admin email or phone. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Ensure the single bootstrap admin exists.
 *
 * Idempotent: keyed on `ADMIN_EMAIL` (and `ADMIN_PHONE` when set), so it never
 * creates a duplicate. An existing admin has its role/status/approval flags
 * repaired, but its password is NEVER silently reset — if the stored hash no
 * longer matches `ADMIN_PASSWORD` a warning is logged and the operator must run
 * `npm run admin:password` to rotate it deliberately.
 *
 * Returns the admin's id.
 */
export async function ensureAdmin(): Promise<string | null> {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const phone = env.ADMIN_PHONE.trim();

  const lookup = phone ? { $or: [{ email }, { phone }] } : { email };
  const existing = await UserModel.findOne(lookup).select('+password');

  if (existing) {
    let changed = false;

    // An earlier seed may have created the admin under a different email while
    // holding the same phone number, which is unique. Re-point it at the
    // configured email instead of failing the unique index on the next create.
    if (existing.email !== email) {
      existing.email = email;
      changed = true;
    }
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      changed = true;
    }
    if (existing.status !== 'active') {
      existing.status = 'active';
      changed = true;
    }
    if (!existing.isApproved) {
      existing.isApproved = true;
      changed = true;
    }
    if (!existing.verified) {
      existing.verified = true;
      changed = true;
    }
    if (phone && existing.phone !== phone) {
      existing.phone = phone;
      changed = true;
    }

    if (changed) {
      await existing.save();
      // eslint-disable-next-line no-console
      console.log(`[seed] Admin account repaired: ${maskEmail(email)}`);
    }

    const matches =
      existing.password && (await verifyPassword(env.ADMIN_PASSWORD, String(existing.password)));
    if (!matches) {
      // eslint-disable-next-line no-console
      console.warn(
        `[seed] Admin password for ${maskEmail(email)} does not match ADMIN_PASSWORD. ` +
          'No change was made — run `npm run admin:password` to rotate it deliberately.',
      );
    }
    return String(existing._id);
  }

  const admin = await UserModel.create({
    role: 'admin',
    name: 'Swat Admin',
    email,
    ...(phone ? { phone } : {}),
    password: await hashPassword(env.ADMIN_PASSWORD),
    verified: true,
    isApproved: true,
    pendingApproval: false,
  });
  await getOrCreateWallet(String(admin._id), false);
  // eslint-disable-next-line no-console
  console.log(`[seed] Admin account created: ${maskEmail(email)}`);
  return String(admin._id);
}

/**
 * Deliberately set the bootstrap admin's password from `ADMIN_PASSWORD`.
 *
 * This is the ONLY path that rewrites an existing admin password. It is exposed
 * through `npm run admin:password` so rotation is an explicit, auditable action
 * rather than a side effect of every boot.
 */
export async function rotateAdminPassword(): Promise<void> {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const admin = await UserModel.findOne({ email }).select('+password');
  if (!admin || admin.role !== 'admin') {
    throw new Error('No admin account found for ADMIN_EMAIL — run `npm run seed` first.');
  }
  admin.password = await hashPassword(env.ADMIN_PASSWORD);
  await admin.save();
  // eslint-disable-next-line no-console
  console.log(`[seed] Admin password rotated for ${maskEmail(email)}`);
}
