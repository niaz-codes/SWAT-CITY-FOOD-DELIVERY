# Payment Methods

## Supported methods

| Method                 | Type          | Status                                 |
| ---------------------- | ------------- | -------------------------------------- |
| Cash on Delivery (COD) | Offline       | Default                                |
| JazzCash               | Mobile wallet | Live (official hosted checkout)        |
| Easypaisa              | Mobile wallet | Live (official Easypay MA integration) |
| Debit/Credit card      | Gateway       | Not integrated (never fake it)         |
| Bank transfer (manual) | Offline       | Optional                               |
| **Demo**               | Simulated     | Testing only — env-gated, see below    |

## Architecture

- One `PaymentService` with a common interface; each provider is an adapter:
  `initiate(order)`, `verify(transactionId)`, `refund(paymentId)`.
- Do NOT duplicate provider logic across screens. Everything goes through `/payments`.

## Flow (online)

1. Client requests payment for an order id (never sends amount as truth).
2. Server computes amount, creates `Payment` (PENDING), calls provider.
3. Provider redirects/callback -> server verifies signature/hash.
4. Server marks `PAID` or `FAILED`, then updates order.
5. Client polls/receives push for final status.

## Demo payments (TESTING ONLY — never real money)

Purpose: run the whole customer → payment → admin pipeline without a live
gateway. **No money of any kind moves.**

- **Gating:** the mode exists only when the backend env sets
  `DEMO_PAYMENTS_ENABLED="true"` (a `zod`-validated value, exported as
  `demoPaymentsEnabled` in `src/config/env.ts`). The client can never enable
  it; unauthenticated/local toggles are impossible. Defaults to off.
- **Provider:** implemented like every other gateway in
  `src/services/payments/demo.ts` and registered in `payments/index.ts`.
  The demo flows through the same `initiateOnlinePayment` →
  `verifyOnlinePayment` machinery as Easypaisa/JazzCash — there is no
  separate settle path, no fake client-side success.
- **Label:** every record and UI surface says **DEMO — NOT REAL MONEY**:
  the app's checkout confirmation + success toast, the admin panel's amber
  badge on the Payments page, the payment `raw` metadata (`demo: true`,
  `simulated: true`), and the ledger description.
- **Admin ledger:** when a demo payment settles, the amount is credited as a
  `commission` WalletTransaction against the ADMIN's wallet with reference
  `demo_<transactionRef>`. Idempotency is manual check + the unique partial
  index `wallet_transactions_demo_ref_key` (`("user", reference) WHERE
  reference LIKE 'demo\_%'`), so a re-verified payment can never credit twice.
- **Method value:** `demo` is a distinct `paymentMethod` (DB check
  constraints `orders_paymentmethod_check` / `payments_method_check` now
  include it), so demo rows are filterable separately from production
  transactions. Transaction refs use the `DM` prefix (`EP`/`JC` unchanged).
- **Expiry:** a demo payment left unverified is swept like gateway payments
  (the sweeper's `$in` list includes `demo`): it is either re-inquired and
  settled — crediting the admin once — or expired to `cancelled`.
- **Tests:**
  `npx tsx src/scripts/test-demo-payments.ts` (offline logic; run with the
  env flag on AND off) and
  `npx tsx src/scripts/e2e-demo-checkout.ts` (live end-to-end against the
  deployed backend: checkout → paid → single admin ledger row).
- **Production safety:** before switching any REAL gateway on,
  `DEMO_PAYMENTS_ENABLED` must go back to `"false"`. There is no fake payment
  success in production code: real orders are only marked paid by verified
  gateway responses through the same settlement path as today.

## COD rules

- Rider confirms cash collected at DELIVERED.
- Rider cash-in (`POST /wallet/cash-in`): the deposit amount is capped server-side by un-deposited COD collections — total of delivered cash orders minus every prior cash-in credit in the wallet ledger. Anything above the computed ceiling (or when nothing is owed) is rejected.
- Daily rider cash reconciliation by admin.
- Optional limit on COD for new users or high-value orders.
- Cancellation refunds for wallet-paid orders are checked against the ledger (refund row named after the order number) so a duplicate cancellation never refunds twice.

## Wallet

- Balance changes are always ledger `WalletTransaction` rows; the wallet balance is a projection, never trusted from the client.
- Money-moving wallet routes (top-up, top-up verify, withdrawal, withdraw cancel, transfer, cash-in) require auth and are rate limited (10/min per user).
- Wallet-to-wallet transfer debits the sender and credits the recipient inside one ledger-checked flow; transfers never mint balance from thin air.
- Rider earnings (food delivery) and ride payouts are credited once per order/ride: the ledger description names the unique order/ride number and is checked before crediting.

## Security requirements

- Merchant IDs, secret keys, integrity salts only in server env vars.
- Verify provider callback signature; ignore unsigned callbacks.
- Idempotency: the same transaction id must never be applied twice. For wallet money legs, ledger rows named after the unique order/ride number are the idempotency key; status transitions that trigger payouts are compare-and-set so concurrent duplicates fail with 409 instead of double-paying.
- Payment initiation endpoints require auth and are rate limited (30/min).
- Never log card numbers, PINs, CVV, or full wallet credentials.
- Store only provider transaction id, masked info, status, amount.

## Refunds

Manual approval by admin; record reason, amount, actor, timestamp.
