// ============================================================
// Swat City Backend - Apply the Postgres schema
//
// `npm run schema:apply` executes backend/supabase/schema.sql against the
// database in DIRECT_URL (falling back to DATABASE_URL). The schema file is
// idempotent — every statement is `create ... if not exists` / `on conflict do
// nothing` — and is wrapped in a single transaction, so re-running it is safe
// and any failure rolls the whole thing back.
//
// This exists because there is no `psql` or Supabase CLI in the deploy
// environment; it is the documented way to bring a fresh database up to date.
// ============================================================

import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

dotenv.config();

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL (or DATABASE_URL) is not set');
  }

  const file = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(__dirname, '../../supabase/schema.sql');
  const sql = readFileSync(file, 'utf8');

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    // eslint-disable-next-line no-console
    console.log(`[schema:apply] applying ${file} ...`);
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log('[schema:apply] schema applied successfully');
  } finally {
    await client.end();
  }
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[schema:apply] failed:', (err as Error).message);
  process.exit(1);
});
