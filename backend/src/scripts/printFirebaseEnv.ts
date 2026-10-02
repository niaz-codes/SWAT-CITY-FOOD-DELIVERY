/**
 * Prints the FIREBASE_SERVICE_ACCOUNT_JSON value as a single line, ready to
 * paste into a hosting dashboard (Render / Railway / Fly.io / Vercel).
 *
 *   npm run print:firebase-env            -> full line
 *   npm run print:firebase-env -- --key  -> just the value
 *
 * The key file itself is gitignored. This script never prints anything except
 * the service-account JSON, which you must treat as a secret.
 */
import fs from 'fs';
import path from 'path';

const candidates = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.resolve(__dirname, '..', 'firebase-service-account.json'),
  path.resolve(process.cwd(), 'firebase-service-account.json'),
].filter(Boolean) as string[];

const file = candidates.find((p) => fs.existsSync(p));

if (!file) {
  // eslint-disable-next-line no-console
  console.error(
    'Service account file not found. Looked in:\n' + candidates.map((p) => `  - ${p}`).join('\n'),
  );
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { private_key?: string };
if (typeof parsed.private_key === 'string') {
  parsed.private_key = parsed.private_key.replace(/\r?\n/g, '\\n');
}

const value = JSON.stringify(parsed);
const asKeyOnly = process.argv.includes('--key');

// eslint-disable-next-line no-console
console.log(asKeyOnly ? value : `FIREBASE_SERVICE_ACCOUNT_JSON=${value}`);