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
  const sql = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log(`[schema:apply] applying ${file} ...`);
    try {
      await client.query(sql);
      console.log('[schema:apply] schema applied successfully');
    } catch (err) {
      // Postgres reports the character offset of the failure — print the
      // offending statement so a drifted schema is diagnosable in one read.
      const e = err as Error & { position?: string };
      if (e.position) {
        const pos = Number(e.position);
        const start = Math.max(0, pos - 400);
        const snippet = sql.slice(start, Math.min(sql.length, pos + 120));
        console.error(`[schema:apply] failed at offset ~${pos}:\n---\n${snippet}\n---`);
      }
      throw err;
    }
  } finally {
    await client.end();
  }
}

void main().catch((err) => {
  console.error('[schema:apply] failed:', (err as Error).message);
  process.exit(1);
});
