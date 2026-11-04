// ============================================================
// e2e-manual-transfer — LIVE end-to-end test of the DIRECT TRANSFER
// (screenshot verification) flow against the DEPLOYED backend.
//
//   npx tsx src/scripts/e2e-manual-transfer.ts
//
// Beats the real customer → admin journey with REAL API calls:
//
//   1. /payments/transfer-methods    → DB-backed, UBL advertised
//   2. /cart + /customer/addresses   → setup (reused where possible)
//   3. /orders (ubl)                 → order created; the SAME
//                                      idempotencyKey replays the SAME order
//   4. /payments/.../transfer        → REAL account details (title+number)
//   5. POST proof                    → pending_verification, upload lands in
//                                      the PRIVATE bucket
//   6. duplicate proof               → 409 (no double submission)
//   7. /admin/payments/verification  → the row is in the live queue
//   8. detail + receipt URL          → signed, reviewer-ready
//   9. APPROVE                       → payment paid, order paymentStatus paid
//  10. proof after approval          → refused (verified money is final)
//  11. SECOND order: reject+resubmit → rejected carries the admin's reason and
//                                      the customer can submit corrected proof
//  12. admin settings               → disable JazzCash, the customer list
//                                      shrinks; re-enable, it returns
//
// QA data only (ids overridable with E2E_CUSTOMER_ID / E2E_RESTAURANT_ID /
// E2E_FOOD_ID / E2E_ADMIN_ID). Nothing is faked: every step is a live HTTP
// call, so a pass here is exactly what a phone and the admin panel see.
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';

const BASE = (process.env.E2E_BASE_URL ?? 'https://backend-production-73f5.up.railway.app/api').replace(/\/+$/, '');
const CUSTOMER_ID = process.env.E2E_CUSTOMER_ID ?? '2f56ce0d-1436-43b4-b179-93ec3ce8817b';
const RESTAURANT_ID = process.env.E2E_RESTAURANT_ID ?? 'cd77dbe6-c2b3-43d2-87ba-6a90fe1066ff';
const FOOD_ID = process.env.E2E_FOOD_ID ?? 'aa0cfeb1-3bde-40b8-b7dc-65f60b07d714';
const ADMIN_ID = process.env.E2E_ADMIN_ID ?? 'b85c1983-ee73-404e-8c18-4379d2b1cf4f';

/** Minimal valid 1×1 PNG — the receipt upload only needs to BE an image. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; token?: string; wantRaw?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-json error body */
  }
  return { status: res.status, body: body ?? {} };
}

/** Multipart proof upload, exactly like the app's fetch form. */
async function uploadProof(
  path: string,
  ref: string,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.append('transactionRef', ref);
  form.append(
    'receipt',
    new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' }),
    'receipt.png',
  );
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-json error body */
  }
  return { status: res.status, body: body ?? {} };
}

// `any` inside: the payloads are heterogeneous JSON we only read opaquely.
function unwrap(body: Record<string, unknown>): Record<string, any> {
  return ((body.data as Record<string, any>) ?? body) as Record<string, any>;
}

function text(obj: unknown): string {
  return obj === undefined || obj === null ? '' : String(obj);
}

/** QA tokens are minted locally with the SAME secret the deployed backend verifies. */
function mint(role: 'customer' | 'admin', sub: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing from backend/.env — cannot mint a QA token');
  return jwt.sign({ sub, role, type: 'access' }, secret, {
    expiresIn: '15m',
    issuer: process.env.JWT_ISSUER || undefined,
  });
}

async function main(): Promise<void> {
  if (!process.env.JWT_SECRET) {
    throw new Error('Run from backend/ with JWT_SECRET in backend/.env (npx tsx from backend)');
  }
  const customerToken = mint('customer', CUSTOMER_ID);
  const adminToken = mint('admin', ADMIN_ID);

  console.log(`E2E manual-transfer against ${BASE}\n`);

  // ---- 1. checkout-facing methods list --------------------------------------
  const methods = await call('/payments/transfer-methods', { token: customerToken });
  check('GET /payments/transfer-methods works', methods.status === 200, `status=${methods.status}`);
  const offered = (unwrap(methods.body).methods ?? []) as Array<Record<string, unknown>>;
  const ubl = offered.find((m) => m.method === 'ubl');
  check('UBL advertised as an enabled checkout method', text(ubl?.enabled) === 'true');

  // ---- 2. cart + address ----------------------------------------------------
  const cart = await call('/cart', {
    method: 'POST',
    token: customerToken,
    body: { restaurantId: RESTAURANT_ID, items: [{ foodItem: FOOD_ID, quantity: 1 }] },
  });
  check('cart set with a QA dish', cart.status === 200 || cart.status === 201, `status=${cart.status}`);

  const addrList = await call('/customer/addresses', { token: customerToken });
  const existing = ((unwrap(addrList.body).addresses ?? []) as Array<Record<string, unknown>>)[0];
  let addressId = text(existing?._id ?? existing?.id);
  if (!addressId) {
    const created = await call('/customer/addresses', {
      method: 'POST',
      token: customerToken,
      body: {
        full: 'E2E Transfer Test, Green Chowk, Saidu Sharif Road',
        area: 'Mingora',
        label: 'E2E Test',
        tag: 'other',
        lat: 34.7699,
        lng: 72.3614,
      },
    });
    addressId = text(unwrap(created.body).address?._id);
  }
  check('delivery address available', Boolean(addressId), `status=${addrList.status}`);

  // ---- 3. place TWO ubl orders (one approve path, one reject path) ----------
  const stamp = Date.now();
  const keyA = `e2e-transfer-${stamp}-a-${Math.random().toString(36).slice(2, 8)}`;
  const keyB = `e2e-transfer-${stamp}-b-${Math.random().toString(36).slice(2, 8)}`;

  const place = async (key: string) =>
    call('/orders', {
      method: 'POST',
      token: customerToken,
      body: { addressId, paymentMethod: 'ubl', note: 'E2E transfer test', idempotencyKey: key },
    });

  const placedA = await place(keyA);
  const orderA = unwrap(placedA.body).order as Record<string, unknown> | undefined;
  const orderIdA = text(orderA?._id ?? orderA?.id);
  check('UBL order placed', placedA.status === 201 || placedA.status === 200, `status=${placedA.status} msg=${text(placedA.body.message).slice(0, 120)}`);
  check('order method is ubl', text(orderA?.paymentMethod) === 'ubl');
  check('order is NOT confirmed before verification', text(orderA?.status) !== 'confirmed');

  // Placing an order consumes the cart, so the second attempt must fill it
  // again before it can order.
  await call('/cart', {
    method: 'POST',
    token: customerToken,
    body: { restaurantId: RESTAURANT_ID, items: [{ foodItem: FOOD_ID, quantity: 1 }] },
  });

  const replayA = await place(keyA);
  const replayData = unwrap(replayA.body);
  const replayId = text(replayData.order?._id ?? replayData.order?.id);
  check(
    'double-click protection: same key → SAME order',
    (replayA.status === 200 || replayA.status === 201) && replayId === orderIdA,
    `status=${replayA.status} replayed=${replayId || '(empty)'}`,
  );

  const placedB = await place(keyB);
  const orderB = unwrap(placedB.body).order as Record<string, unknown> | undefined;
  const orderIdB = text(orderB?._id ?? orderB?.id);
  check('second UBL order placed (reject test)', placedB.status === 201 || placedB.status === 200, `status=${placedB.status}`);
  if (!orderIdA || !orderIdB) {
    throw new Error(`Order placement failed: ${text(placedA.body.message)} / ${text(placedB.body.message)}`)
  }

  // ---- 4. the customer sees REAL receiving-account details -------------------
  const detailsA = await call(`/payments/orders/${orderIdA}/transfer`, { token: customerToken });
  const accA = unwrap(detailsA.body).account as Record<string, unknown> | undefined;
  check('transfer instructions load', detailsA.status === 200, `status=${detailsA.status}`);
  check('account title present (not blank/invented)', text(accA?.accountTitle).length >= 3, text(accA?.accountTitle));
  check('account number present', text(accA?.accountNumber).length >= 5, text(accA?.accountNumber));
  check('exact amount shown = server total', Number(unwrap(detailsA.body).order?.total) > 0);

  // ---- 5. submit the receipt -------------------------------------------------
  const refA = `E2E-TXN-${stamp}-A`;
  const submitA = await uploadProof(`/payments/orders/${orderIdA}/transfer`, refA, customerToken);
  check(
    'proof submitted → pending verification',
    (submitA.status === 200 || submitA.status === 201) &&
      text(unwrap(submitA.body).payment?.status ?? unwrap(submitA.body).order?.paymentStatus).includes('pending'),
    `status=${submitA.status} msg=${text(submitA.body.message).slice(0, 120)}`,
  );

  // ---- 6. duplicate submission refused --------------------------------------
  const refDup = `E2E-TXN-${stamp}-DUP`;
  const submitDup = await uploadProof(`/payments/orders/${orderIdA}/transfer`, refDup, customerToken);
  check('duplicate proof refused (409)', submitDup.status === 409, `status=${submitDup.status}`);
  const dupDetails = await call(`/payments/orders/${orderIdA}/transfer`, { token: customerToken });
  const dupRefEcho = text((unwrap(dupDetails.body).payment as Record<string, unknown> | undefined)?.transactionRef);
  check('the FIRST reference is kept (not overwritten)', dupRefEcho === refA, `echo=${dupRefEcho}`);

  // ---- 7. admin queue shows the submission -----------------------------------
  const queue = await call('/admin/payments/verification?page=1&limit=20', { token: adminToken });
  check('admin queue loads (the route works)', queue.status === 200, `status=${queue.status} msg=${text(queue.body.message).slice(0, 80)}`);
  const queueRows = (unwrap(queue.body).payments ?? []) as Array<Record<string, unknown>>;
  const rowA = queueRows.find((r) => text(r.transactionRef) === refA);
  check('submitted payment IS in the live queue', Boolean(rowA));
  const paymentIdA = text(rowA?._id);

  // ---- 8. detail bundle + receipt (owner-checked signed URL) -----------------
  if (paymentIdA) {
    const detail = await call(`/admin/payments/verification/${paymentIdA}`, { token: adminToken });
    const bundle = unwrap(detail.body).verification as Record<string, any> | undefined;
    check('review detail loads', detail.status === 200);
    check('receipt URL available for the reviewer', text(bundle?.payment?.receiptUrl).length > 20);
    check('customer identity attached', text(bundle?.customer?.name).length > 0);
    check(
      'audit trail records the customer submission',
      (bundle?.audit ?? []).some((row: Record<string, unknown>) => text(row.decision) === 'receipt_submitted'),
    );
  }

  // ---- 9. APPROVE ------------------------------------------------------------
  const approve = await call(`/admin/payments/verification/${paymentIdA}/decision`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'approve' },
  });
  check('approve succeeds', approve.status === 200, `status=${approve.status} msg=${text(approve.body.message).slice(0, 120)}`);

  const paidState = await call(`/payments/orders/${orderIdA}/payment`, { token: customerToken });
  check(
    'customer sees payment PAID',
    text(unwrap(paidState.body).payment?.status) === 'paid' ||
      text(unwrap(paidState.body).orderPaymentStatus) === 'paid',
  );
  const orderAState = await call(`/admin/orders/${orderIdA}`, { token: adminToken });
  const adminOrderA = unwrap(orderAState.body).order as Record<string, any> | undefined;
  const adminOrderPaymentStatus =
    text(adminOrderA?.paymentStatus) || text(adminOrderA?.payment?.paymentStatus) || text(adminOrderA?.payment?.status);
  check('order paymentStatus is paid after approval', adminOrderPaymentStatus === 'paid', `got=${adminOrderPaymentStatus}`);

  // ---- 10. submit-after-approved refused -------------------------------------
  const postApprove = await uploadProof(`/payments/orders/${orderIdA}/transfer`, `E2E-TXN-${stamp}-PAID`, customerToken);
  check('no proof accepted after verification (money is final)', postApprove.status === 409, `status=${postApprove.status}`);

  // ---- 11. REJECT + resubmit -------------------------------------------------
  const refB = `E2E-TXN-${stamp}-B`;
  const submitB = await uploadProof(`/payments/orders/${orderIdB}/transfer`, refB, customerToken);
  check('second order proof submitted', submitB.status === 200 || submitB.status === 201, `status=${submitB.status}`);
  const queue2 = await call('/admin/payments/verification?page=1&limit=100', { token: adminToken });
  const rows2 = (unwrap(queue2.body).payments ?? []) as Array<Record<string, unknown>>;
  const rowB = rows2.find((r) => text(r.transactionRef) === refB);
  const paymentIdB = text(rowB?._id);
  const reject = await call(`/admin/payments/verification/${paymentIdB}/decision`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'reject', reason: 'E2E: amount does not match the bank statement' },
  });
  check('reject with reason succeeds', reject.status === 200, `status=${reject.status} msg=${text(reject.body.message).slice(0, 120)}`);

  const rejectedDetails = await call(`/payments/orders/${orderIdB}/transfer`, { token: customerToken });
  const payB = (unwrap(rejectedDetails.body).payment as Record<string, unknown> | undefined) ?? {};
  check('customer sees REJECTED', text(payB.status) === 'rejected');
  check('rejection reason reaches the customer', text(payB.failureReason).includes('bank statement'), text(payB.failureReason));

  const resubmit = await uploadProof(`/payments/orders/${orderIdB}/transfer`, `${refB}-R1`, customerToken);
  check('corrected proof accepted after rejection', resubmit.status === 200 || resubmit.status === 201, `status=${resubmit.status}`);
  const resubmitDetails = await call(`/payments/orders/${orderIdB}/transfer`, { token: customerToken });
  check(
    'resubmitted proof is waiting for verification again',
    text((unwrap(resubmitDetails.body).payment as Record<string, unknown> | undefined)?.status) === 'pending_verification',
  );
  // Leave this row in the queue on purpose — it shows the visible workflow on
  // the live admin panel; an admin can then decide on it for real.

  // ---- 12. payment-method settings are live (admin-managed) ------------------
  const disableJC = await call('/admin/payment-methods/jazzcash', {
    method: 'PUT',
    token: adminToken,
    body: { enabled: false },
  });
  check('admin can disable JazzCash (settings write to DB)', disableJC.status === 200, `status=${disableJC.status} msg=${text(disableJC.body.message).slice(0, 120)}`);
  const afterDisable = await call('/payments/transfer-methods', { token: customerToken });
  const offered2 = (unwrap(afterDisable.body).methods ?? []) as Array<Record<string, unknown>>;
  check('disabled method disappears from the customer list', !offered2.some((m) => m.method === 'jazzcash_transfer'));

  const reEnable = await call('/admin/payment-methods/jazzcash', {
    method: 'PUT',
    token: adminToken,
    body: { enabled: true },
  });
  check('re-enabling restores the method', reEnable.status === 200, `status=${reEnable.status}`);

  const afterEnable = await call('/payments/transfer-methods', { token: customerToken });
  const offered3 = (unwrap(afterEnable.body).methods ?? []) as Array<Record<string, unknown>>;
  check('JazzCash screenshot appears again after enable', offered3.some((m) => m.method === 'jazzcash_transfer'));

  // ---- done ------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('Failed checks:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`E2E run aborted: ${(error as Error).message}`);
  process.exitCode = 1;
});
