# Direct Bank / Wallet Transfer Payments (Admin-Verified)

This document describes the **Direct Bank Transfer (UBL)** payment system plus the
manual **Easypaisa** and **JazzCash** transfer options, which are all verified by
an admin against the real bank/account activity before an order is accepted.

> **There is no bank API and no automatic verification in this system.** A
> customer-submitted screenshot or transaction ID is never treated as proof of
> payment. Only an authorised admin, comparing the submission with the actual
> UBL statement / account activity, can mark a payment as verified.

---

## 1. Checkout methods

| Checkout key | Label shown to customer | Receiving account (server-config) |
|---|---|---|
| `ubl` | Direct Bank Transfer (UBL) | UBL account `0405289118711` — title from `UBL_ACCOUNT_TITLE` |
| `easypaisa_transfer` | Easypaisa (Direct Transfer) | Company Easypaisa `03450050667` |
| `jazzcash_transfer` | JazzCash (Direct Transfer) | Company JazzCash `03265521032` |

These are *manual* methods (`gateway = 'manual'` on the payment row) and are
completely separate from the live Easypaisa/JazzCash gateway integrations, which
keep the keys `easypaisa` / `jazzcash`. No gateway API credentials are needed
for the manual options; they can be switched off server-side with
`MANUAL_PAYMENTS_ENABLED=false`.

Receiving-account numbers live **only** in backend configuration
(`backend/.env`, documented in `backend/.env.example`) and are served to the
customer only through an owner-checked, order-scoped endpoint. They are never
bundled into a client asset.

## 2. Customer workflow

1. Customer places the order choosing a direct-transfer method.
   - Order is created with payment status `pending` (awaiting transfer) and
     stays **unconfirmed** — the kitchen is not notified and no rider is assigned.
   - The response carries `transferDetails` (account, exact payable amount,
     order number) and the app navigates to the transfer-instructions screen.
2. Customer transfers the **exact** order total to the shown account, then
   submits the **transaction/reference ID + receipt screenshot** on the
   `ManualTransfer` screen (max 5 submissions, duplicate-proof).
   - Payment + order move to `pending_verification`.
   - Message shown: **“Payment submitted. Waiting for admin verification.”**
   - Nothing is settled, confirmed, or dispatched at this point.
3. Admin decision (see §3):
   - **Approve** → payment + order `paid`/`verified`, customer notified, and the
     admin can now accept (`pending → confirmed`) or reject the order per
     restaurant availability. Rider assignment continues through the existing
     authorized workflow only.
   - **Reject** → payment/order `rejected`, reason stored and shown to the
     customer; the order stays unconfirmed; the customer may submit corrected
     proof (same payment row, bounded attempts).
   - **Request info** → still `pending_verification`; admin note recorded; the
     customer is asked for a clearer receipt / more details.

Statuses (payment + order payment status):
`pending` → `pending_verification` → `paid` (or `rejected` → resubmit) —
order lifecycle remains `pending → confirmed → preparing → ready →
rider_assigned → picked_up → on_the_way → delivered`.

## 3. Admin panel — “Transfer Verification”

Navigation: **Finance → Transfer Verification** (`/payments/verification`),
available only to `role=admin` (enforced by `requireAuth + requireAdmin`).

- Queue filtered by stage: Awaiting verification / Verified / Rejected / All.
- Detail view shows: order number, customer name + phone, expected order
  amount (the value to compare against), submitted transaction reference,
  receipt screenshot preview (short-lived signed URL, refreshable), submission
  time, attempt/resubmission count, and the full audit log.
- Actions: **Verify & approve** (requires a receipt on file + an explicit
  confirmation that the UBL statement was checked), **Reject payment**
  (required reason ≥ 4 chars), **Request new receipt / info** (required note).
- Every action re-validates: ownership of the flow, manual-gateway state,
  exact amount match against the server-side order total, and decision rules.
- The admin is expected to check the company UBL account / statement (or the
  mobile-wallet activity log) before approving. Nothing here talks to a bank.

The admin also cannot accept an order (`pending → confirmed`) via the ordinary
Orders screen while its payment is anything other than `paid` (except the
cash/wallet methods that settle on delivery or at placement).

## 4. API surface

Customer (`requireAuth + requireCustomer`):
- `GET  /payments/orders/:id/transfer` — transfer instructions + proof state.
- `POST /payments/orders/:id/transfer` — multipart: `receipt` (≤5MB image/pdf)
  + `transactionRef`. Idempotent against duplicates (409 while verification is
  in progress; reference reuse across payments refused; attempts capped).
- `GET  /payments/orders/:id/transfer/receipt` — customer’s own receipt
  (short-lived signed URL).

Admin (`requireAuth + requireAdmin`):
- `GET   /admin/payments/verification?status=&page=&limit=` — queue.
- `GET   /admin/payments/verification/:id` — review bundle + audit trail.
- `POST  /admin/payments/verification/:id/decision` — `{decision, reason?}`.
- `GET   /admin/payments/verification/:id/receipt` — fresh signed receipt URL.

## 5. Security properties

- **Amount manipulation**: the verified amount is always the server-side order
  total (`orders.total` = `payments.amount`); clients never send an amount.
  A stored mismatch blocks submission and review outright.
- **Forged approvals**: `POST /payments/verification/:id/decision` is reachable
  only by `role=admin`; the service performs a compare-and-set
  (`pending_verification → paid/…`), so replayed/raced decisions conflict
  instead of double-settling. Approve additionally requires a stored receipt.
- **Duplicate submissions**: 409 while `pending_verification`; the payment row
  is recycled for corrections (history in one place); 5-attempt cap.
- **Replay attacks**: the unique index `(gateway, transactionRef)` on
  `payments` prevents one transaction reference from being claimed by a second
  payment row.
- **Receipt privacy**: uploads go to the **private** `payment-receipts` Storage
  bucket (RLS-enabled, service-role writes only). Reads are served as
  short-lived signed URLs only through owner-checked (customer) or
  admin-checked endpoints. No public URL exists.
- **Audit log**: `payment_verifications` (append-only by the application) records
  `receipt_submitted | approve | reject | request_info` with actor, role,
  timestamp, reason, amount and reference. RLS enabled, zero policies — the
  backend API is the only access path.
- **Order protection**: `advanceOrderStatus(pending → confirmed)` is blocked
  for every non-cash/wallet method while `paymentStatus ≠ paid`.
  Customer “verify” endpoints cannot settle manual payments (they are gateway
  methods only), so no customer call path reaches `paid`.

## 6. Configuration reference (`backend/.env`)

```ini
MANUAL_PAYMENTS_ENABLED=true
MANUAL_PAYMENT_BANK_NAME=UBL – United Bank Limited
UBL_ACCOUNT_TITLE=Swat City Food Delivery
UBL_ACCOUNT_NUMBER=0405289118711
UBL_IBAN=                # optional
UBL_BRANCH=              # optional
EASYPAISA_TRANSFER_NUMBER=03450050667
EASYPAISA_TRANSFER_TITLE=Swat City Food Delivery
JAZZCASH_TRANSFER_NUMBER=03265521032
JAZZCASH_TRANSFER_TITLE=Swat City Food Delivery
MANUAL_PAYMENT_RECEIPT_BUCKET=payment-receipts
MANUAL_PAYMENT_RECEIPT_URL_MINUTES=30
```

All values have safe defaults matching the table in §1; the bucket is created
automatically by the schema migration.

## 7. Database migration

Appended to `backend/supabase/schema.sql` (idempotent) and applied with
`npm run schema:apply`:

- widened `orders.paymentMethod` + `payments.method` CHECKs with
  `ubl, easypaisa_transfer, jazzcash_transfer`;
- widened `payments.status` + `orders.paymentStatus` CHECKs with
  `pending_verification, rejected`;
- new `payment_verifications` table (RLS on, service-role only, 3 indexes);
- new partial indexes for the admin verification queue
  (`payments_manual_gateway_status_idx`, `payments_manual_method_created_idx`);
- private `payment-receipts` bucket (`storage.buckets`, `public = false`).

## 8. Operational SOP for the admin

1. Open **Transfer Verification**, pick the oldest *Awaiting verification* row.
2. Open the company UBL app/statement (or wallet activity) for that day.
3. Confirm: amount == expected order total **exactly**, destination account ==
   the company account, status == completed/successful.
4. Cross-check the customer’s transaction reference appears in the statement.
5. If everything matches → **Verify & approve** (optionally paste the matched
   statement entry as the audit note).
6. If it does not match → **Reject payment** with a concrete reason (“amount
   short by Rs X”, “reference not found on statement”, …).
7. If the receipt is unreadable but may be genuine → **Request new receipt**.
8. Only after approval, accept the order in **Orders** and let the existing
   dispatch/rider workflow proceed as usual.
