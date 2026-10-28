// ============================================================
// test-demo-payments — offline checks for the DEMO payment mode.
//
//   npx tsx src/scripts/test-demo-payments.ts          (reads backend/.env)
//   DEMO_PAYMENTS_ENABLED=true npx tsx ...              (forced on)
//
// Pure logic only: no rows are written. The LIVE end-to-end path
// (checkout → settle → admin ledger) is covered by
// src/scripts/e2e-demo-checkout.ts against the deployed backend.
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import { availableGateways, demoProvider, getProvider } from '../services/payments';
import { generateTransactionRef } from '../services/payment.service';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  const envOn = process.env.DEMO_PAYMENTS_ENABLED === 'true';
  console.log(`demo mode as loaded: DEMO_PAYMENTS_ENABLED="${process.env.DEMO_PAYMENTS_ENABLED ?? 'unset'}" (treating as ${envOn ? 'ENABLED' : 'DISABLED'})\n`);

  const enabled = demoProvider.isConfigured();

  check('demo provider registered', getProvider('demo') === demoProvider);

  const gateways = availableGateways();
  const demoEntry = gateways.find((g) => g.method === 'demo');
  check('availableGateways lists the demo row', Boolean(demoEntry));
  check(
    'demo row availability matches the env flag',
    demoEntry?.enabled === envOn,
    `entry.enabled=${demoEntry?.enabled}`,
  );
  check(
    'demo row always carries the safety label',
    demoEntry?.demoLabel === 'DEMO — NOT REAL MONEY',
    `label=${demoEntry?.demoLabel ?? '(none)'}`,
  );
  const realGateways = gateways.filter((g) => g.method !== 'demo');
  check(
    'real gateways unaffected by the demo enum widening',
    realGateways.map((g) => g.method).sort().join(',') === 'easypaisa,jazzcash',
  );

  if (!enabled) {
    const result = await demoProvider.verify({
      transactionRef: 'SWT1-DM-AAAAAAAA',
      expectedAmountPkr: 500,
    });
    check('disabled demo never settles anything', result.status === 'failed');
    const initiate = await demoProvider.initiate({
      transactionRef: 'SWT1-DM-AAAAAAAA',
      amountPkr: 500,
      orderNumber: 'SWT1',
      description: 'test',
      returnUrl: '',
      customerPhone: '',
      customerEmail: '',
    });
    check('disabled demo refuses initiation', !initiate.ok);
  } else {
    const result = await demoProvider.verify({
      transactionRef: 'SWT1-DM-AAAAAAAA',
      expectedAmountPkr: 500,
    });
    check('enabled demo settles exactly the expected amount', result.status === 'paid' && result.amount === 500);
    const raw = result.status === 'paid' ? result.raw : undefined;
    check(
      'settled demo raw data is explicitly simulated',
      raw?.demo === true && raw?.simulated === true,
    );

    // Amount contract: the provider echoes the EXPECTED amount, so a tampered
    // payment row can never be "confirmed" for different money.
    const tampered = await demoProvider.verify({
      transactionRef: 'SWT1-DM-AAAAAAAA',
      expectedAmountPkr: 999999,
    });
    check('amount is the server expectation, echoed verbatim', tampered.status === 'paid' && tampered.amount === 999999);
  }

  // Transaction refs stay in the same shape as the real gateways.
  const ref1 = generateTransactionRef('SWTAB12CD34', 'demo');
  const ref2 = generateTransactionRef('SWTAB12CD34', 'demo');
  check('demo transactionRef uses the DM prefix', /^SWTAB12CD34-DM-[0-9A-F]{8}$/.test(ref1), ref1);
  check('two refs for one order never collide', ref1 !== ref2);
  check('easypaisa ref prefix unchanged', /^X-EP-[0-9A-F]{8}$/.test(generateTransactionRef('X', 'easypaisa')));
  check('jazzcash ref prefix unchanged', /^X-JC-[0-9A-F]{8}$/.test(generateTransactionRef('X', 'jazzcash')));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main().catch((e) => {
  console.error('[test-demo-payments] failed:', (e as Error).message);
  process.exit(1);
});
