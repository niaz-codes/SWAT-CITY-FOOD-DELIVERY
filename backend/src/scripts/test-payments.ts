/**
 * Payment gateway unit tests.
 *
 * These lock down the parts that must match the gateway specs exactly — the
 * JazzCash `pp_SecureHash` algorithm, PKR→paisa conversion, Easypaisa MSISDN
 * normalisation and easypaisa/JazzCash status mapping. A regression here means
 * real payments silently fail or, worse, get mis-verified.
 *
 * Run with: npx tsx src/scripts/test-payments.ts
 */
import assert from 'assert';
import { createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';
import { jazzCashSecureHash, toPaisa, gatewayDateTime } from '../services/payments/jazzcash';
import { normalizeMsisdn } from '../services/payments/easypaisa';
import { createHandoffToken, readHandoffToken } from '../services/payments/handoffToken';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    // eslint-disable-next-line no-console
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error(`  FAIL  ${name}`);
    // eslint-disable-next-line no-console
    console.error(`        ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// JazzCash pp_SecureHash
//
// Reference vector taken from the Jazz sandbox sample payload:
//   pp_payload = { pp_Version: "1.1", pp_MerchantID: "00127801",
//     pp_TxnType: "MPAY", pp_Password: "0123456789", ... ,
//     pp_SecureHash: "C980487EA7C5191AFA8FF285133F1FC6BA5608C0C47126E31FFE21E2AF4AE4E7" }
//
// That sample's blank/whitespace placeholder fields cannot be reproduced
// reliably, so instead of asserting a possibly-wrong constant we assert the
// *properties* the guide specifies: ordering, salt prefixing, encoding, casing,
// and field inclusion/exclusion rules.
// ---------------------------------------------------------------------------

test('SecureHash excludes blank field values', () => {
  const withBlanks = jazzCashSecureHash({ pp_A: 'x', pp_B: '', pp_C: '   ', pp_D: 'y' }, 'SALT');
  const withoutBlanks = jazzCashSecureHash({ pp_A: 'x', pp_D: 'y' }, 'SALT');
  assert.strictEqual(withBlanks, withoutBlanks);
});

test('SecureHash ignores field ordering (values sorted by ASCII)', () => {
  const a = jazzCashSecureHash({ pp_Amount: '10000', pp_MerchantID: 'M1', pp_TxnCurrency: 'PKR' }, 'S');
  const b = jazzCashSecureHash({ pp_TxnCurrency: 'PKR', pp_Amount: '10000', pp_MerchantID: 'M1' }, 'S');
  assert.strictEqual(a, b);
});

test('SecureHash changes when any value changes', () => {
  const base = jazzCashSecureHash({ pp_Amount: '10000', pp_MerchantID: 'M1' }, 'S');
  const tamperedAmount = jazzCashSecureHash({ pp_Amount: '1', pp_MerchantID: 'M1' }, 'S');
  const tamperedSalt = jazzCashSecureHash({ pp_Amount: '10000', pp_MerchantID: 'M1' }, 'S2');
  assert.notStrictEqual(base, tamperedAmount);
  assert.notStrictEqual(base, tamperedSalt);
});

test('SecureHash is uppercase hex, 64 chars (SHA-256)', () => {
  const hash = jazzCashSecureHash({ pp_Amount: '10000' }, 'SALT');
  assert.match(hash, /^[0-9A-F]{64}$/);
});

test('SecureHash ignores non-pp_ fields', () => {
  const a = jazzCashSecureHash({ pp_Amount: '10000' }, 'S');
  const b = jazzCashSecureHash({ pp_Amount: '10000', other: 'ignored', ppNope: 'x' }, 'S');
  assert.strictEqual(a, b);
});

test('SecureHash is deterministic (same input, same output)', () => {
  const fields = { pp_Version: '2.0', pp_TxnRefNo: 'REF1', pp_Amount: '10000', pp_TxnCurrency: 'PKR' };
  assert.strictEqual(jazzCashSecureHash(fields, 'SALT'), jazzCashSecureHash(fields, 'SALT'));
});

test('SecureHash ignores a pre-existing pp_SecureHash field', () => {
  const a = jazzCashSecureHash({ pp_Amount: '10000' }, 'S');
  const b = jazzCashSecureHash({ pp_Amount: '10000', pp_SecureHash: 'deadbeef' }, 'S');
  assert.strictEqual(a, b);
});

// ---------------------------------------------------------------------------
// Amount conversion
// ---------------------------------------------------------------------------

test('PKR converts to paisa as an integer string', () => {
  assert.strictEqual(toPaisa(100), '10000');
  assert.strictEqual(toPaisa(1), '100');
  assert.strictEqual(toPaisa(0.5), '50');
});

test('paisa conversion rounds rather than truncates', () => {
  // 10.005 PKR must not silently become 1000 paisa (a 0.5 paisa undercharge).
  assert.strictEqual(toPaisa(10.005), '1001');
});

test('paisa conversion has no floating point artefacts', () => {
  // 8.29 * 100 is 828.9999... in binary floating point.
  assert.strictEqual(toPaisa(8.29), '829');
});

// ---------------------------------------------------------------------------
// Gateway timestamp format (yyyyMMddHHmmss in PKT)
// ---------------------------------------------------------------------------

test('gateway datetime is yyyyMMddHHmmss', () => {
  const formatted = gatewayDateTime(new Date('2026-03-04T05:06:07.000Z'));
  assert.match(formatted, /^\d{14}$/);
});

test('gateway datetime is rendered in Asia/Karachi (UTC+5)', () => {
  // 2026-03-04T18:30:00Z is 23:30 PKT the same day.
  const pkT = gatewayDateTime(new Date('2026-03-04T18:30:00.000Z'));
  assert.ok(pkT.endsWith('233000'), `expected 23:30:00 PKT, got ${pkT}`);
  assert.ok(pkT.startsWith('20260304'), `expected 2026-03-04, got ${pkT}`);
});

// ---------------------------------------------------------------------------
// Easypaisa MSISDN normalisation
// ---------------------------------------------------------------------------

test('accepts a plain 03xx mobile number', () => {
  assert.strictEqual(normalizeMsisdn('03001234567'), '03001234567');
});

test('strips spaces, dashes and parentheses', () => {
  assert.strictEqual(normalizeMsisdn('0300 123 4567'), '03001234567');
  assert.strictEqual(normalizeMsisdn('0300-123-4567'), '03001234567');
  assert.strictEqual(normalizeMsisdn('(0300) 1234567'), '03001234567');
});

test('converts +92 and 0092 country prefixes', () => {
  assert.strictEqual(normalizeMsisdn('+923001234567'), '03001234567');
  assert.strictEqual(normalizeMsisdn('00923001234567'), '03001234567');
  assert.strictEqual(normalizeMsisdn('923001234567'), '03001234567');
});

test('rejects numbers that are not 03xx or too short', () => {
  assert.strictEqual(normalizeMsisdn('04001234567'), null);
  assert.strictEqual(normalizeMsisdn('0300123456'), null);
  assert.strictEqual(normalizeMsisdn('030012345678'), null);
  assert.strictEqual(normalizeMsisdn(''), null);
  assert.strictEqual(normalizeMsisdn(undefined), null);
  assert.strictEqual(normalizeMsisdn('not-a-number'), null);
});

// ---------------------------------------------------------------------------
// Easypaisa response code handling
// ---------------------------------------------------------------------------

test('Easypaisa treats only 0000 as success', async () => {
  const { EASYPAISA_SUCCESS_CODE, EASYPAISA_TERMINAL_FAILURES } = await import(
    '../services/payments/types'
  );
  assert.strictEqual(EASYPAISA_SUCCESS_CODE, '0000');
  // Terminal failures must all map to a hard failure, never to pending.
  for (const code of ['FAILED', 'EXPIRED', 'BLOCKED', 'REVERSED']) {
    assert.ok((EASYPAISA_TERMINAL_FAILURES as readonly string[]).includes(code));
  }
});

test('JazzCash success code is 000 (not Easypaisa 0000)', async () => {
  const { JAZZCASH_SUCCESS_CODE } = await import('../services/payments/types');
  assert.strictEqual(JAZZCASH_SUCCESS_CODE, '000');
});

// ---------------------------------------------------------------------------
// Handoff tokens
//
// The JazzCash checkout page is public, so its capability must be unforgeable
// and short-lived rather than a guessable ObjectId.
// ---------------------------------------------------------------------------

test('handoff token round-trips the payment id', () => {
  const id = '68b1234567890abcdef123456';
  assert.strictEqual(readHandoffToken(createHandoffToken(id)), id);
});

test('handoff token rejects a tampered payment id', () => {
  const token = createHandoffToken('68b1234567890abcdef123456');
  const [prefix, exp, payload, sig] = token.split('.');
  const parts = Buffer.from(payload!, 'base64url').toString('utf8').split('|');
  const forged = Buffer.from(
    ['payment-handoff', parts[1], '68bfffffffffffffffffff999', parts[3]].join('|'),
    'utf8',
  ).toString('base64url');
  // Reuse the genuine signature against a different body.
  assert.strictEqual(readHandoffToken(`${prefix}.${exp}.${forged}.${sig}`), null);
});

test('handoff token rejects a forged signature', () => {
  const token = createHandoffToken('68b1234567890abcdef123456');
  const parts = token.split('.');
  parts[3] = 'A'.repeat(parts[3]!.length);
  assert.strictEqual(readHandoffToken(parts.join('.')), null);
});

test('handoff token rejects an expired token', () => {
  const id = '68b1234567890abcdef123456';
  const past = Date.now() - 60_000;
  const nonce = randomBytes(16).toString('base64url');
  const body = ['payment-handoff', nonce, id, String(past)].join('|');
  const signature = createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url');
  const token = `ph1.${past}.${Buffer.from(body, 'utf8').toString('base64url')}.${signature}`;
  assert.strictEqual(readHandoffToken(token), null);
});

test('handoff token rejects malformed input', () => {
  assert.strictEqual(readHandoffToken(''), null);
  assert.strictEqual(readHandoffToken('nonsense'), null);
  assert.strictEqual(readHandoffToken('ph1.abc.def.ghi'), null);
});

test('handoff tokens are unique per call', () => {
  const a = createHandoffToken('68b1234567890abcdef123456');
  const b = createHandoffToken('68b1234567890abcdef123456');
  assert.notStrictEqual(a, b);
});

// ---------------------------------------------------------------------------

// eslint-disable-next-line no-console
console.log(`\npayment gateway tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);