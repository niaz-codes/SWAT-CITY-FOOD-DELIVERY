import { connectDB, disconnectDB } from './config/db';
import { seedDemoData } from './services/seed.service';

/**
 * `npm run seed` — explicit command to populate demo data (admin is seeded on
 * every boot automatically; this adds restaurants + food items the first time).
 */
async function main(): Promise<void> {
  await connectDB();
  try {
    await seedDemoData();
    // eslint-disable-next-line no-console
    console.log('[seed] Done.');
  } finally {
    await disconnectDB();
  }
}

void main();