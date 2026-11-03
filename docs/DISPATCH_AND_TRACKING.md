# Rider dispatch & live tracking (backend → app)

How a food order travels from **verified payment** → **rider assignment** → **customer live tracking**, and where every gate lives.

## Database (`backend/supabase/schema.sql`, applied with `npm run schema:apply`)

Additive + idempotent migration applied to the live Supabase project:

| Object | Purpose |
| --- | --- |
| `orders.dispatchstartedat` / `dispatchlastofferat` / `dispatchattempts` / `dispatchlastadminalertat` | Offer-round bookkeeping for the auto-dispatch sweeper. |
| `orders_dispatch_pool_idx` | Partial index for the unclaimed-`ready` pool query. |
| Widened `orders_paymentstatus_check` / `orders_paymentmethod_check` | Accept the manual-transfer lifecycle values. |
| `accept_rider_order(uuid, uuid)` | **The atomic claim.** One SQL statement: rider approval check → one-active-delivery check → row-locked claim (`rider` + `status='rider_assigned'` + rider payout) → flips the rider profile to `busy`. Returns `accepted / order_unavailable / rider_not_approved / rider_busy`. Revoked from `public/anon/authenticated`; granted to `service_role` only. |

> Identifiers in the orders migration are written **lowercase** on purpose: Postgres folds unquoted identifiers, the data layer (`backend/src/db/model.ts`) lowercases every column it writes, and the live tables are therefore lowercase (`paymentstatus`, `statushistory`, …). Quoted camelCase would create a parallel column nothing reads.

## The payment gate (three layers, one rule)

A rider can only be offered/assigned an order when **`paymentstatus = 'paid'`**, or **`pending` AND `paymentmethod = 'cash'`** (cash is legitimately payable on delivery). A manual-transfer order (UBL / Easypaisa / JazzCash) whose screenshot is still `pending_verification` — or was `rejected` — can never be assigned.

1. `dispatch.service.ts` (`paymentEligible`) — gates offer rounds and the sweeper.
2. `rider.controller.ts` (`riderFeed`) — gates the feed the rider app polls.
3. `accept_rider_order` SQL — gates even a forged/direct claim.

No new RLS policies were added: the tables stay service-role-only (upload/verify surfaces pass through the backend), so the admin-verified screenshot remains the single source of "this is money".

## Backend flow

1. Admin approves a payment screenshot → `paymentstatus` becomes `paid` (paymentReview.service, unchanged).
2. Restaurant moves the order to `ready` (`advanceOrderStatus`) → `dispatchOrder(orderId)` runs:
   - offers the order to every approved rider with `status='online'` **in their private socket room** (`order:request`, payload includes drop-off address, distance, payout, `attempt`, `ttlMs`) — never to `role:rider`, because joining that room is not approval-gated;
   - Expo push (`order_ready`) to the same set;
   - records the round in the new columns.
3. Sweeper (`DISPATCH_SWEEP_SECONDS`=15s) re-broadcasts expired rounds (`DISPATCH_RETRY_SECONDS`=45s) and, when **no rider is online**, alerts admins every `DISPATCH_ADMIN_ALERT_MINUTES`=3 min instead of letting orders strand silently.
4. Rider accepts (`POST /rider/jobs/accept` → `riderAcceptsOffer`): one atomic SQL claim. Winner gets the order + `order:rider-assigned` in their own room; every other rider app gets `order:request:resolved` to drop the offer; customer is notified.
5. Cancellation clears pending offers (`stopDispatchForOrder`); delivered/cancelled returns the rider to `online` only when no other active job holds them (`revertRiderStatusIfIdle`).
6. Admin early-dispatch (`assignRiderToOrder(allowEarly)`) is unchanged for `pending/confirmed`; a `ready` order goes through the same SQL claim.

`startDispatchSweeper()` starts/stops in `server.ts` next to the payment sweeper.

## Live tracking (`GET /orders/:id/track`)

Normalized payload (powers the customer map in both socket and REST paths):

- `trackingActive` — true only for `rider_assigned / picked_up / on_the_way`; **stops** at delivered/cancelled.
- `rider` — id/name/phone/avatar so the customer card has a working `tel:` call button; `location` comes from the rider profile's `lastLocation` (10s flush cache in `riderLocation.service.ts`) and is null when tracking is over.
- `pickup` (restaurant coordinates, GeoJSON `[lng,lat]` in DB, returned as lat/lng) + `destination` (addressSnapshot coords).
- `riderDistanceKm` / `etaMinutes` — haversine to the rider's **next stop** (pickup before collection, drop-off after), ~22 km/h urban speed factor.

## Mobile app

- `RiderOrderOffer` (mounted in `RiderMainShell`): full-screen countdown modal for `order:request` (server-provided `ttlMs`), Accept (atomic claim; navigation straight into the active delivery) / Reject; a dismissed round stays suppressed until the retry round arrives (attempt number), and `order:request:resolved` closes it the instant the order leaves the pool.
- `RiderHome`: feed refreshes on those socket events + a 15s poll safety net.
- Location: idle `online` riders keep the foreground watcher (stops on background, as before). Riders **mid-delivery** (`busy`) run the Android **foreground-service** location task (`expo-task-manager` + `startLocationUpdatesAsync`, notification visible), so GPS keeps flowing while they navigate in another app or lock the phone. `app.json` carries the `expo-location` plugin with `isAndroidForegroundServiceEnabled` + iOS `UIBackgroundModes: ["location"]`. Transition out of `busy` stops the service and downgrades to the plain watcher.

## Environment

```
DISPATCH_OFFER_TTL_SECONDS=40   # Accept countdown per offer round
DISPATCH_RETRY_SECONDS=45       # When a NEW round is broadcast for the same order
DISPATCH_SWEEP_SECONDS=15       # Sweeper scan interval
DISPATCH_ADMIN_ALERT_MINUTES=3  # Re-alert cadence when no rider is online
```

## Verified

- `npm run schema:apply` applied cleanly to the live DB (columns, partial index, widened CHECKs, function + grant).
- `accept_rider_order` exercised in a rollback transaction on live data: paid manual transfer → `accepted` (payout = round((deliveryFee+platformFee)×0.75)); concurrent loser → `order_unavailable`; rider already active → `rider_busy`; **unverified pending manual transfer → `order_unavailable`** (payment gate holds); cash+pending → `accepted`; rider profile flipped to `busy`; rollback left the DB untouched.
- Backend and app TypeScript both pass typecheck.
