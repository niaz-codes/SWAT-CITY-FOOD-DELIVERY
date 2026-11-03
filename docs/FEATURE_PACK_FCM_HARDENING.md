# Feature pack: direct FCM · cancel/refund · payment reminders · rider rating · ETA push · hardening

This batch extends the dispatch pipeline (see `DISPATCH_AND_TRACKING.md`) with the
second wave of product work. Everything is uncommitted with the rest of the branch.

---

## 1. Direct FCM v1 (Firebase Admin SDK)

Historically every push went over the **Expo Push Service** and any non-Expo
token was dropped with a warning. The device-token list is now a **mixed,
routed** array:

| Token shape | Transport | Who holds them |
| --- | --- | --- |
| `ExponentPushToken[...]` / `ExpoPushToken[...]` | Expo Push API (`expoPush.ts`) | Expo Go + every runtime the app can register from |
| anything else, non-empty | **Firebase Cloud Messaging v1** (`fcm.ts`) | Android release/dev-client APKs built with the Firebase project |

Routing lives in `backend/src/services/notification.service.ts`
(`pushToTokens` + `pushBroadcast`); both transports run **in parallel** per
notification, and tokens that either transport reports permanently dead
(`DeviceNotRegistered` / `messaging/registration-token-not-registered`) are
pruned exactly as before.

### Setup (server)

```
FIREBASE_SERVICE_ACCOUNT_JSON=   # service-account JSON (raw or Base64) — leave blank = Expo only
FIREBASE_PROJECT_ID=             # optional; normally derived from the key
FCM_ENABLED=true                 # master switch (EXPO_PUSH_ENABLED unaffected)
```

Firebase Console → Project settings → Service accounts → *Generate new private
key*, paste the JSON (Base64 it if the raw value fights with the platform's
env editor). `server.ts` prints `fcmpush: enabled | DISABLED by FCM_ENABLED |
not configured` in the integration report at boot, next to the Expo Push line.
Missing credentials are a **degraded mode, not an error**: notifications keep
flowing through in-app + Socket.IO + Expo Push.

### Setup (mobile)

`src/services/notifications.ts` now registers **both** tokens behind the same
`ensurePushTokenRegistered()` flow:

- the Expo token as before, and
- `getDevicePushTokenAsync()` result on **Android non-Expo-Go** runtimes
  (cached under `@swat/fcm-device-token`; iOS is skipped — it yields an APNs
  token the backend has no transport for).

Both land in the same `users.devicetokens` array via the existing
`POST /auth/device-token`.

**Release-APK requirement:** `getDevicePushTokenAsync` only returns a token
scoped to a Firebase project when the app was built with that project's
`google-services.json`. Note: `plugins/withGoogleServices.js` currently
*removes* the stale Google-Services Gradle line (Expo-Go era) — when shipping
direct-FCM APKs, swap it for the `@react-native-firebase/app` wiring (the file
documents exactly this) or restore the classpath + plugin pair with the JSON in
place. Until the app is rebuilt with Firebase config, FCM tokens simply never
register and Expo Push carries everything, so nothing regresses.

---

## 2. Order cancellation → refund flow polish

`order.service.ts::cancelOrder`:

- **Minimum reason (3 chars)** enforced server-side for every caller, not by
  convention of one controller.
- **Manual-transfer refund queue:** a `paid` order on
  `ubl / easypaisa_transfer / jazzcash_transfer` that gets cancelled now
  - flips `order.paymentstatus` + the `payments` row to `refunded` (with
    `refundedAt`), and
  - notifies **every active admin**: *"Manual transfer refund required — send
    the money back to the customer's paying account."* No fake automatic
    refunds: the return leg is a human banking action, and the alert puts it on
    a person, not on a ledger row nobody reads.
- Customer cancel-copy is split three ways: wallet → "refunded to your
  wallet", manual transfer → "queue — admin will return it to your paying
  account", unpaid → nothing claimed.

---

## 3. Payment reminders (`paymentReminder.ts`)

A manual-transfer order stuck in `pending_verification` is invisible to the
customer. The new sweeper (started in `server.ts` beside the expiry sweeper,
every 30 min):

- finds `kind='order'` manual-transfer payments older than
  `PAYMENT_REMINDER_HOURS` (default 2h) **whose order is still pending
  verification**, and
- sends **one** reminder push to the customer — the CAS marker
  `metadata.reminderSentAt` on the payments row makes it strictly once per
  submission state (a resubmitted proof is a fresh pending row and gets its own
  reminder),
- and when it did send something, one admin nudge summarising the pile
  (`payment_settled` event — the notification CHECK constraint has no generic
  "reminder" event; `order_placed` for the customer keeps the manual-payment
  lifecycle consistent).

Rejection alerts already carried the admin's reason verbatim, and a
rejected-payment push tap routes into `OrderTracking` where the existing
**Retry payment** CTA opens the ManualTransfer resubmit — verified, no change
was needed.

---

## 4. Rider rating

Backend (`review.controller.ts`): `targetType: 'rider'` reviews are now
enforced, not just accepted:

- require `orderId`,
- the order must be **`delivered`** and owned by the caller,
- `targetId` must equal `order.rider` (the rider **user** id),
- the review row links `rider` (+ `orderId`) denormalised,
- `refreshTargetRating` recomputes `rider_profiles.rating` from all rider
  reviews (pre-existing aggregate path, now actually reachable),
- one review per (user, rider) stays the dedupe rule.

Mobile (`OrderTracking.tsx`): after delivery a second CTA **"Rate your rider"**
opens the same stars dialog (now parameterised with `title` / `submitLabel`);
the rider id comes from `tracking.rider.id` or the order snapshot. 409 answers
render as "already rated", same as restaurant ratings.

---

## 5. Delivery ETA push

At the single `on_the_way` transition (`advanceOrderStatus`), the customer push
body gains *"Arriving in about N min (X km away)"* — computed once from the
rider profile's last known fix → `addressSnapshot` coords with the same
haversine + ~22 km/h factor as live tracking. No per-GPS-tick pushes, no new
notification events; when either coordinate is missing the push ships without
the suffix.

---

## 6. Security hardening pack

**Rate limiting was already in place** (`middleware/rateLimit.ts`) and is left
as-is; this batch adds the missing **audit trail** for admin actions that had
none:

| Action | Audit location |
| --- | --- |
| Payment approve / reject / request_info | `payment_verifications` (existing) |
| Withdrawal payouts | `withdrawals.metadata.audit` rows (existing) |
| Rider approve / reject / suspend / activate | **new `admin_audit` table** |
| Rider vehicle plate override / vehicle-change decision | `admin_audit` |
| Admin cancel order (records the refund outcome) | `admin_audit` |
| User status changes (ban / reactivate) | `admin_audit` |

`backend/src/models/AdminAudit.ts` + `services/adminAudit.service.ts`
(`recordAdminAction` — best-effort, never breaks the admin action). The DDL in
`schema.sql` follows the dispatch migration conventions: lowercase identifiers,
RLS enabled with **zero policies** (service-role only), applied with
`npm run schema:apply` (verified against the live DB).

See `docs/SUPABASE_RLS.md` for the full RLS posture; the standing rule is
unchanged: clients never write money columns directly, every money mutation
passes through backend-gated endpoints.

---

## Type/verification log

- Backend `tsc --noEmit` + eslint on every touched file: clean.
- App `tsc --noEmit` + eslint (`notifications.ts`, `OrderTracking.tsx`): clean.
- `npm run schema:apply`: applied (new `admin_audit` table + indexes).
- Live-DB probes: `reviews`, `payments`, `admin_audit` selects OK; the reminder
  sweeper's exact filter (manual methods + `pending_verification` + stale
  cutoff) executes read-only against production data.
- **Rebuild note:** FCM token pickup + the FGS location task both require a
  fresh APK (`eas build` / `npx expo prebuild`); the JS falls back gracefully
  on old builds.

---

## 7. APK rebuild v4 — `react-native-worklets` link fix

Release build of `versionCode 4` initially failed linking
`libworklets.so` (arm64-v8a) with hundreds of `undefined symbol` errors for the
C++ runtime (`operator new`, `std::__ndk1::mutex::lock()`, `__cxa_*`,
`std::runtime_error`, …) — i.e. libc++ was simply never linked.

**Root cause chain:**

1. The project lives under `C:\Users\Niaz Khan MK\Desktop\...` and the Android
   SDK under `C:\Users\Niaz Khan MK\AppData\...` — paths containing spaces.
2. On Windows, CMake converts compiler paths that contain spaces to 8.3 short
   paths, so the link step invokes the compiler as
   `...\bin\CLANG_~1.EXE` instead of `...\bin\clang++.exe`.
3. LLVM's driver picks its mode from **argv0's basename**. `CLANG_~1.EXE` is
   not recognizable as `clang++`, so the driver stays in C mode and never
   auto-links libc++.
4. The NDK 27.1 *legacy* toolchain handles `ANDROID_STL=c++_shared` by
   deliberately NOT adding any libc++ to `CMAKE_CXX_STANDARD_LIBRARIES` — it
   relies exactly on that clang++ auto-link. Net result: C++ objects compiled
   against `std::__ndk1` headers but a link with no C++ runtime at
   all (`--no-undefined` makes every referenced symbol a hard error).

Verified experimentally: the exact failing link command succeeds with
`clang++` spelled out (long path) and fails through `CLANG_~1.EXE`; adding
`-lc++_shared` fixes it in both cases.

**Fix applied:** `android-legacy.toolchain.cmake` in the local NDK install
(`...\ndk\27.1.12297006\build\cmake\`; original kept as `.bak`) — the
`c++_shared` branch now appends `-lc++_shared` to `ANDROID_CXX_STANDARD_LIBRARIES`,
so every module configured with `c++_shared` links the C++ runtime explicitly,
independent of how CMake spells the driver. `libc++_shared.so` itself is
packaged into the APK from the react-android/fbjni AARs, so runtime behavior
(`DT_NEEDED libworklets → libc++_shared`) stays consistent with the rest of RN.

Other habits unchanged: prebuild → `gradlew.bat assembleRelease`; output APK at
`android\app\build\outputs\apk\release\app-release.apk`.
