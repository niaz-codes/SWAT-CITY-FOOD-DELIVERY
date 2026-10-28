// ============================================================
// e2e-demo-checkout — LIVE end-to-end test of the DEMO payment mode.
//
//   npx tsx src/scripts/e2e-demo-checkout.ts
//
// Drives the DEPLOYED backend (Railway by default) through the exact
// customer journey the app uses:
//
//   1. /health
//   2. /payments/methods        → demo must be reported ENABLED
//   3. /cart                    → one QA dish
//   4. /customer/addresses      → reuse or create a delivery address
//   5. /orders (demo)           → order + payment created server-side
//   6. /payments/.../verify     → demo settles, order becomes PAID
//   7. verify again             → idempotent, still paid
//   8. re-initiate payment      → rejected (order already paid)
//   9. /orders with SAME idempotency key → replays the SAME order
//  10. direct DB check          → EXACTLY ONE admin ledger row named
//                                 demo_<transactionRef> (never two)
//
// The order produced is a REAL order row against the QA restaurant,
// labelled DEMO — NOT REAL MONEY end to end. It is intentionally left in
// place so the admin panel demonstrates the flow. The QA customer id can
// be overridden with E2E_CUSTOMER_ID / E2E_RESTAURANT_ID / E2E_FOOD_ID.
//
// Auth: the QA customer's access token is minted locally with the same
// JWT_SECRET/JWT_ISSUER the deployed backend uses.
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { Client } from 'pg';

const BASE = (process.env.E2E_BASE_URL ?? 'https://backend-production-73f5.up.railway.app/api').replace(/\/+$/, '');
const ROOT = BASE.replace(/\/api$/, '');
const CUSTOMER_ID = process.env.E2E_CUSTOMER_ID ?? '2f56ce0d-1436-43b4-b179-93ec3ce8817b';
const RESTAURANT_ID = process.env.E2E_RESTAURANT_ID ?? 'cd77dbe6-c2b3-43d2-87ba-6a90fe1066ff';
const FOOD_ID = process.env.E2E_FOOD_ID ?? 'aa0cfeb1-3bde-40b8-b7dc-65f60b07d714';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, body: body ?? {} };
}

/** sendSuccess wraps payloads in `data`; errors surface `message`. */
// `any` inside: the payloads are heterogeneous JSON we only read opaquely.
function unwrap(body: Record<string, unknown>): Record<string, any> {
  return ((body.data as Record<string, any>) ?? body) as Record<string, any>;
}

function text(obj: unknown): string {
  return obj === undefined || obj === null ? '' : String(obj);
}

async function main(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET missing from backend/.env — cannot mint a QA token');
  const token = jwt.sign({ sub: CUSTOMER_ID, role: 'customer', type: 'access' }, jwtSecret, {
    expiresIn: '15m',
    issuer: process.env.JWT_ISSUER || undefined,
  });

  console.log(`E2E demo checkout against ${BASE}\n`);

  // ---- 1. health -----------------------------------------------------------
  const health = await call('', { token }) // /api ping shape varies; not fatal
    .catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
  check('deployed backend reachable (/health)', health.status > 0, `status=${health.status}`);

  // ---- 2. payment methods: demo advertised + enabled ------------------------
  const methods = await call('/payments/methods', { token });
  check('GET /payments/methods authorised', methods.status === 200, `status=${methods.status}`);
  const gatewayList = (unwrap(methods.body).methods ?? []) as Array<Record<string, unknown>>;
  const demoMethod = gatewayList.find((m) => m.method === 'demo');
  check('demo method is advertised', Boolean(demoMethod));
  check('demo method is ENABLED on the deployed backend', demoMethod?.enabled === true);
  check('demo method carries the safety label', text(demoMethod?.demoLabel) === 'DEMO — NOT REAL MONEY');

  // ---- 3. cart with one QA dish --------------------------------------------
  const cart = await call('/cart', {
    method: 'POST',
    token,
    body: { restaurantId: RESTAURANT_ID, items: [{ foodItem: FOOD_ID, quantity: 1 }] },
  });
  check('cart set with a QA dish', cart.status === 200 || cart.status === 201, `status=${cart.status}`);

  // ---- 4. delivery address --------------------------------------------------
  const addrList = await call('/customer/addresses', { token });
  const existing = ((unwrap(addrList.body).addresses ?? []) as Array<Record<string, unknown>>)[0];
  let addressId = text(existing?._id ?? existing?.id);
  if (!addressId) {
    const created = await call('/customer/addresses', {
      method: 'POST',
      token,
      body: {
        full: 'E2E Demo Test, Green Chowk, Saidu Sharif Road',
        area: 'Mingora',
        label: 'E2E Test',
        tag: 'other',
        lat: 34.7699,
        lng: 72.3614,
        isDefault: false,
      },
    });
    addressId = text(unwrap(created.body).address?._id);
    check('delivery address created', Boolean(addressId), `status=${created.status}`);
  } else {
    check('delivery address reused', true);
  }

  // ---- 5. place the demo order ---------------------------------------------
  const idempotencyKey = `e2e-demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const placed = await call('/orders', {
    method: 'POST',
    token,
    body: {
      addressId,
      paymentMethod: 'demo',
      note: 'E2E demo checkout test',
      customerPhone: '03009999003',
      idempotencyKey,
    },
  });
  const order = unwrap(placed.body).order as Record<string, unknown> | undefined;
  const payment = unwrap(placed.body).payment as Record<string, unknown> | undefined;
  const demoMode = unwrap(placed.body).demoMode as Record<string, unknown> | undefined;
  const orderId = text(order?._id ?? order?.id);
  const transactionRef = text(payment?.transactionRef);
  check('demo order created', placed.status === 201 || placed.status === 200, `status=${placed.status}`);
  check('payment method is demo', text(payment?.method) === 'demo');
  check('create-order response labels DEMO — NOT REAL MONEY', text(demoMode?.label) === 'DEMO — NOT REAL MONEY');
  if (failed > 0 && !orderId) {
    throw new Error(`Order placement failed: ${text(placed.body.message)} — aborting`);
  }

  // ---- 6. verify → paid ------------------------------------------------------
  const verify = await call(`/payments/orders/${orderId}/payment/verify`, { method: 'POST', token, body: {} });
  const verifyData = unwrap(verify.body);
  check(
    'demo payment verifies as PAID',
    text(verifyData.status) === 'paid' || text(verifyData.payment?.status) === 'paid',
    JSON.stringify(verifyData).slice(0, 200),
  );

  // ---- 7. verify again → idempotent -----------------------------------------
  const verify2 = await call(`/payments/orders/${orderId}/payment/verify`, { method: 'POST', token, body: {} });
  check(
    're-verification is idempotent (still paid, not an error)',
    verify2.status === 200 && (text(unwrap(verify2.body).status) === 'paid' || text(unwrap(verify2.body).payment?.status) === 'paid'),
    `status=${verify2.status}`,
  );

  // ---- 8. duplicate payment initiation → refused -----------------------------
  const dupPay = await call(`/payments/orders/${orderId}/payment`, {
    method: 'POST',
    token,
    body: { paymentMethod: 'demo' },
  });
  check(
    'duplicate payment request is rejected (order already paid)',
    dupPay.status === 409 || /already paid/i.test(text(dupPay.body.message)),
    `status=${dupPay.status} msg=${text(dupPay.body.message).slice(0, 120)}`,
  );

  // ---- 9. duplicate ORDER with the same idempotency key → replay -------------
  const dupOrder = await call('/orders', {
    method: 'POST',
    token,
    body: { addressId, paymentMethod: 'demo', note: '', idempotencyKey },
  });
  const replayId = text(unwrap(dupOrder.body).order?._id ?? unwrap(dupOrder.body).order?.id);
  check(
    'same idempotency key replays the SAME order (no duplicate order)',
    replayId === orderId,
    `status=${dupOrder.status} replayed=${replayId || '(empty)'} msg=${text(dupOrder.body.message).slice(0, 120)}`,
  );

  // ---- 10. admin ledger: exactly one demo credit ------------------------------
  const adminId = process.env.E2E_ADMIN_ID ?? 'b85c1983-ee73-404e-8c18-4379d2b1cf4f';
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL/DATABASE_URL missing — cannot check the admin ledger');
  const client = new Client({
    connectionString,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  const ledger = await client.query(
    `SELECT _id, amount, type, description, metadata
       FROM public.wallet_transactions
      WHERE "user" = $1 AND reference = $2`,
    [adminId, `demo_${transactionRef}`],
  );
  check('admin ledger has the demo_<transactionRef> credit row', ledger.rows.length === 1, `rows=${ledger.rows.length}`);
  if (ledger.rows.length === 1) {
    const row = ledger.rows[0];
    check('ledger row is a commission credit', text(row.type) === 'commission');
    check(
      'ledger row is explicitly labelled DEMO — NOT REAL MONEY',
      /DEMO — NOT REAL MONEY/.test(text(row.description)),
      text(row.description),
    );
    check(
      'ledger row metadata names the order',
      text((row.metadata as Record<string, unknown> | null)?.orderId) === orderId,
    );
  }
  await client.end();

  // ---- summary ---------------------------------------------------------------
  console.log('\n---- DEMO ORDER SUMMARY (kept on purpose — it demonstrates the admin flow) ----');
  console.log(`orderNumber : ${text(order?.orderNumber) || orderId}`);
  console.log(`total       : ${text(order?.total)} PKR  (DEMO — NOT REAL MONEY)`);
  console.log(`txnRef      : ${transactionRef}`);
  console.log(`admin ledger: demo_${transactionRef}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error('[e2e-demo-checkout] failed:', (err as Error).message);
  process.exit(1);
});
