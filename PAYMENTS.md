# Payment Methods

## Supported methods

| Method                 | Type          | Status           |
| ---------------------- | ------------- | ---------------- |
| Cash on Delivery (COD) | Offline       | Default          |
| JazzCash               | Mobile wallet | Planned/Enabled? |
| Easypaisa              | Mobile wallet | Planned/Enabled? |
| Debit/Credit card      | Gateway       | Optional         |
| Bank transfer (manual) | Offline       | Optional         |

> Update the Status column to match the real implementation.

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
