// ============================================================
// repair-db-columns — one-off LIVE migration that reconciles the
// database with the db layer's naming invariant.
//
// The backend db facade (src/db/model.ts) lowercases EVERY column
// key it writes (`toDbRow`) and every filter path (`dbPath`), and
// reads map rows back the same way (`mapRowToCamel` looks up
// col.toLowerCase()). PostgreSQL folds unquoted identifiers to
// lowercase, so long as every column was created UNQUOTED this all
// works. Four engagement-suite ALTERs (and older additive DDL on
// other tables) used QUOTED camelCase names, which Postgres keeps
// case-sensitive — those columns became unreachable for the app:
//
//   - INSERTs failed with PostgREST PGRST204 ("Could not find the
//     'loyaltydiscount' column of 'orders'") → every place-order
//     call 500'd.
//   - SELECTs silently dropped the values (mapRowToCamel looks for
//     a lowercase key the row does not carry).
//
// This script renames every public-table column that contains an
// uppercase letter to its lowercase form (data preserved), then
// asks PostgREST to reload its schema cache. Idempotent: rerunning
// finds nothing to do.
//
//   npx tsx src/scripts/repair-db-columns.ts
// ============================================================

import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';

const connStr = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';
if (!connStr) {
  throw new Error('DIRECT_URL (or DATABASE_URL) is required — no direct DB connection available');
}

const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function main(): Promise<void> {
  await client.connect();

  const camel = await client.query(
  `select table_name, column_name
   from information_schema.columns
   where table_schema = 'public' and column_name ~ '[A-Z]'
   order by table_name, column_name`,
);

if (camel.rows.length === 0) {
  console.log('No camelCase columns — schema already reconciled, nothing to do.');
  await client.end();
  process.exit(0);
}

for (const { table_name: table, column_name: column } of camel.rows) {
  const lower = column.toLowerCase();
  const twins = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, lower],
  );
  if (twins.rows.length > 0) {
    // Never guess in a data-loss situation: a real lowercase twin means the
    // two columns may hold different data and a human must merge them.
    console.error(
      `SKIP ${table}.${column} — a lowercase twin "${lower}" already exists; manual merge required.`,
    );
    process.exitCode = 1;
    continue;
  }
  await client.query(`alter table public."${table}" rename column "${column}" to ${lower}`);
  console.log(`renamed ${table}."${column}" -> ${lower}`);
}

  // Hang on to the case-sensitivity the layer expects: PostgREST caches the
  // schema; a reload makes the renamed columns visible immediately.
  await client.query(`notify pgrst, 'reload schema'`);
  console.log("notified pgrst to reload the schema cache");

  // Post-rent check: the invariant must now hold everywhere.
  const remaining = await client.query(
    `select count(*)::int as n from information_schema.columns
     where table_schema = 'public' and column_name ~ '[A-Z]'`,
  );
  console.log(`remaining camelCase columns: ${remaining.rows[0].n}`);

  await client.end();
}

main().catch((error: unknown) => {
  console.error(`repair aborted: ${(error as Error).message}`);
  process.exitCode = 1;
});
