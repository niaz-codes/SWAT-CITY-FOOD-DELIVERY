import { connectDB, disconnectDB } from './config/db';
import { env, isProduction } from './config/env';
import {
  DEV_CUSTOMER_EMAIL,
  DEV_CUSTOMER_PASSWORD,
  DEV_RIDER_EMAIL,
  DEV_RIDER_PASSWORD,
  seedDevData,
} from './services/devSeed.service';

/**
 * `npm run seed:dev` — development-only demo dataset.
 *
 * Two independent guards keep this away from production:
 *   1. NODE_ENV=production is refused outright.
 *   2. An explicit SEED_DEV_DATA=true acknowledgement is required, so a stray
 *      run against a shared/staging database cannot happen by accident.
 *
 * It creates one customer, one approved online rider, two restaurants with
 * menus and three sample orders. Re-running repairs the same records instead of
 * duplicating them.
 */
function refuse(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`[seed:dev] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (isProduction || process.env.NODE_ENV === 'production') {
    refuse('Refusing to run with NODE_ENV=production.');
  }
  if (process.env.SEED_DEV_DATA !== 'true') {
    refuse(
      'Refusing to write demo data without confirmation.\n' +
        'Run: SEED_DEV_DATA=true npm run seed:dev\n' +
        'Only do this against a development database.',
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed:dev] Target Supabase host: ${new URL(env.SUPABASE_URL).host} (NODE_ENV=${env.NODE_ENV})`,
  );

  await connectDB();
  try {
    const result = await seedDevData();
    // eslint-disable-next-line no-console
    console.log(
      [
        '[seed:dev] Done.',
        `  customer : ${DEV_CUSTOMER_EMAIL} / ${DEV_CUSTOMER_PASSWORD}`,
        `  rider    : ${DEV_RIDER_EMAIL} / ${DEV_RIDER_PASSWORD}`,
        `  restaurants: ${result.restaurants}, menu items: ${result.menuItems}`,
        `  orders created this run: ${result.ordersCreated}`,
        '  Dev data is for local testing only. Never run this against production.',
      ].join('\n'),
    );
  } finally {
    await disconnectDB();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[seed:dev] Failed:', (error as Error).message);
  process.exit(1);
});
