// ============================================================
// Swat City Backend - Explicit admin password rotation
//
// `npm run admin:password` sets the bootstrap admin's password to the value of
// ADMIN_PASSWORD in the backend environment. This is the only deliberate path
// that rewrites an existing admin password — normal boot never resets it.
//
// The password is read from the environment and never printed or logged.
// ============================================================

import { connectDB, disconnectDB } from '../config/db';
import { rotateAdminPassword } from '../services/seed.service';

async function main(): Promise<void> {
  await connectDB();
  try {
    await rotateAdminPassword();
  } finally {
    await disconnectDB();
  }
}

void main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('[admin:password] failed:', (err as Error).message);
  await disconnectDB();
  process.exit(1);
});
