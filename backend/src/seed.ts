import { connectDB, disconnectDB } from './config/db';
import { ensureAdmin } from './services/seed.service';

/**
 * `npm run seed` — explicit bootstrap command. Ensures the single admin account
 * exists (also done automatically on boot); no demo business data is seeded.
 */
async function main(): Promise<void> {
  await connectDB();
  try {
    await ensureAdmin();
    // eslint-disable-next-line no-console
    console.log('[seed] Done.');
  } finally {
    await disconnectDB();
  }
}

void main();
