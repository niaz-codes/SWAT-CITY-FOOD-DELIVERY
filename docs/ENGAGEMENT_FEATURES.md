# Engagement Suite — Chat · Loyalty · Referrals · Scheduled Orders · Analytics

Added in the v1.1.0 feature round. Everything is manual-style consistent with the
existing platform: the backend derives all authority from server-side data
(order records, wallets, app_settings), never from the client request body.

---

## 1. Per-order chat (customer ↔ rider ↔ restaurant)

Every order gets a chat thread rooted on the order row — there is no "start
chat" step.

**Participation rules** (`backend/src/services/chat.service.ts`, `describeChatAccess`):

| Sender | Counterpart |
|---|---|
| customer | assigned rider, falling back to the restaurant owner |
| rider | customer |
| restaurant owner | customer |

The sender/recipient pair is always resolved from the ORDER, never from the
request. Admins are never participants.

**Open window:** chatting is closed on cancelled orders; delivered orders keep a
24-hour grace window (measured from the `delivered` status-history entry).

**Endpoints** (mounted under `/api/engagement`, all roles with an account on the
order):

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat/orders/:id/messages` | send `{ body }` (1–1000 chars, trimmed) |
| GET | `/chat/orders/:id/messages` | thread (oldest→newest); marks it read for me |
| GET | `/chat/unread-count` | total unread across threads |

**Delivery:** Socket.IO event `chat:message` (`{ orderId, message }` targeted at
`user:<id>` rooms) + Expo push with notification event `chat_message` (routed
with `refId` = orderId so tapping jumps to the order thread).

**Storage:** `chat_messages` table (RLS enabled, zero policies — backend service
role only), indexes on `(order, createdAt)` and unread triage by recipient.

---

## 2. Loyalty points

Points live on `customer_profiles.loyalty_points` (integer). Admin-editable
settings (defaults):

| Key | Default | Meaning |
|---|---|---|
| `loyalty_points_per_hundred` | 5 | points earned per Rs 100 of subtotal |
| `loyalty_point_value` | 1 | Rs discount per redeemed point |
| `loyalty_max_percent` | 30 | max % of subtotal payable with points |

**Lifecycle (all in `loyalty.service.ts` + `order.service.ts`):**

- **Earning:** on delivery, `pointsEarnable(subtotal)` is floored and credited.
- **Redemption:** checkout quote (`GET /orders/quote?redeemPoints=`) and
  placement cap the request to the settings cap and the balance; the debit is a
  compare-and-set so concurrent checkouts cannot overdraw (402 otherwise).
- **Refund:** cancelling an order with redeemed points returns them exactly once
  (single CAS transition guards it).
- **Idempotent earn:** the award is skipped if the order already carries a
  non-zero `loyaltyPointsEarned`.

**Client endpoint:** `GET /api/engagement/loyalty` → `{ balance, config,
pointWorth, earnPerHundred }` (non-customers get zeros, not a 403).

**Order fields:** `tip`, `loyaltyPointsRedeemed`, `loyaltyDiscount`,
`loyaltyPointsEarned` (also persisted from checkout). Total formula:
`subtotal + deliveryFee + platformFee − discount − loyaltyDiscount + tip`.

---

## 3. Referrals

- Every customer gets a unique 6-character share code (`referralCode`, drawn
  from the no-confusable alphabet, partial-unique index) minted at signup
  (email + Google). Unknown/invalid codes never fail a signup.
- `users.referredBy` records who applied at signup (customers only).
- **Payout:** when the REFERRED customer's FIRST food order is delivered, both
  sides get `referral_reward` Rs (default 100, admin-editable) wallet credit,
  named `Referral reward for order <num> (referrer|welcome)` — ledger-level
  idempotency (exact-description lookup, same pattern as cancel refunds).
- **Client endpoint:** `GET /api/engagement/referrals` → `{ code, reward,
  referredCount, earned, referred[] }`.

---

## 4. Scheduled delivery orders

- `orders.scheduledFor` (timestamptz) — accepted in checkout
  (`placeOrderSchema` → ISO string) and validated server-side by
  `scheduledForError`: **30 minutes – 7 days ahead**, invalid slots are 422s
  before any payment lock or points debit.
- Orders carry the badge in admin/portal views; cooking stays a manual
  restaurant decision (no forced kitchen timer).

---

## 5. Restaurant portal additions

| Feature | Endpoint(s) | Notes |
|---|---|---|
| Review replies | `GET /restaurant/reviews`, `POST /restaurant/reviews/:id/reply` | `reply` ≤500 chars; `repliedAt`/`repliedBy` set; one editable reply per review |
| Prep time | `PATCH /restaurant/me` with `prepTimeMin` (1–240) | overrides the delivery estimate shown to customers (`computeOrderTotals`) |

---

## 6. Rider earnings hub + leaderboard

`GET /rider/earnings` fixes (previously placeholders):

- `acceptance` = delivered / delivered+cancelled (100% until the first job)
- `totalKm` = delivered order `distanceKm` + completed ride `distanceKm`
- `period.target` / `period.progress` from the `rider_weekly_target` setting

New: `GET /rider/leaderboard` → top riders by delivered-order earnings in the
rolling 7 days, plus the caller's own rank (`me.rank` null if unranked).

---

## 7. Admin analytics

`GET /api/admin/analytics?range=today|7d|30d|quarter` →

- `summary` — revenue (+ % change vs the previous equivalent window), delivered
  orders (+ % change), cancelled, avg order, completed rides, new customers,
  reviews and reply coverage
- `series` — daily `{ date, orders, revenue, uniqueCustomers }`
- `topRestaurants` / `topRiders` / `topDishes` — window-scoped leaders

Revenue counts only delivered orders, matching the definition used everywhere
else. (Broadcast push already existed on the Notifications page.)

---

## Migration notes

All of the above is one additive, idempotent block appended to
`backend/supabase/schema.sql` (chat_messages table, users.referralCode/
referredBy, customer_profiles.loyaltyPoints, order fields, review reply fields,
restaurants.prepTimeMin, notifications CHECK widened for `chat_message`,
app_settings defaults). Apply with `npm run schema:apply` — safe to re-run.

**Deploy order:** apply schema → deploy backend → deploy admin panel → publish
the new APK. The old (previous-version) mobile install should be uninstalled
before sideloading a same-signature, lower-versionCode build.
