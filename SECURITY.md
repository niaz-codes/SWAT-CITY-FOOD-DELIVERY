# Security Rules (Mandatory)

## Demo payments (TESTING ONLY)

- The simulated payment mode exists **only** when the server env sets
  `DEMO_PAYMENTS_ENABLED="true"`; the flag is validated server-side and can
  never be switched on by a client. Default is off.
- Every demo record (payment row, wallet ledger row, app UI, admin panel
  badge) says **`DEMO — NOT REAL MONEY`**. Demo money is accounted against
  the ADMIN wallet as a `commission` ledger row named
  `demo_<transactionRef>`, guarded by a unique partial index so a replay can
  never credit twice.
- No fake payment success exists in production: a real order is only marked
  paid by a server-verified gateway response. Real gateway code paths are
  unchanged by the demo provider. See `PAYMENTS.md` for the full contract.

## Secrets

- No keys/passwords/tokens in code or git history. Use `.env` + `.env.example`.
- Add `.env`, keystores, `google-services.json` (if private), `*.pem` to `.gitignore`.
- Rotate any key that was ever committed.

## Authentication

- Phone OTP and/or email+password; passwords hashed (bcrypt/argon2).
- Email OTP codes (login / registration / password reset) are generated, emailed and verified by Supabase Auth (service-role client, server-side only). The backend never sees or stores the raw code; its `email_otps` table only enforces lifetime, attempt bounds and resend limits.
- Supabase email templates render the code (`{{ .Token }}`) only — never `{{ .ConfirmationURL }}` — and the project's Site URL / Redirect URLs are allowlisted (never the localhost default). Opening a link consumes the single-use code, so links are not part of the verification flow.
- Short-lived access token + refresh token; secure storage on device (Keystore/Keychain, not SharedPreferences plain text).
- Rate-limit login and OTP endpoints.
- JWTs are verified with the HS256 algorithm pinned (`algorithms: ['HS256']`); tokens signed with a different algorithm are rejected.
- Refresh re-checks the user: suspended or unverified accounts cannot mint new access tokens (the refresh handler mirrors the middleware checks).

## Authorization

- Role-based: CUSTOMER, RESTAURANT, RIDER, ADMIN.
- Check role AND ownership on every endpoint (a customer can only read own orders).
- Restaurant portal endpoints accept **no restaurant id ever**: every route
  resolves the kitchen through `ownedRestaurant(req.user._id)`. A `restaurant`
  user structurally cannot read or write another restaurant's orders, menu or
  profile — there is no parameter to swap.
- The web panel accepts two roles (`admin`, `restaurant`) and splits them at the
  router: `/portal/*` is `restaurant`-only, everything else is `admin`-only.
  The role is also re-checked per request on the server, so a portal-only
  account cannot call admin endpoints and vice versa.
- Owner-editable profile updates whitelist fields in a dedicated zod schema;
  platform flags (`featured`, `rating`, `isApproved`, `ownerUser`, `slug`) are
  stripped and unreachable through portal routes — only `/admin/restaurants`
  can change them.

## Input & API

- Validate and sanitise all input server-side (zod schemas via the `validate` middleware; only the request body is replaced with parsed data, never query/params).
- Search-style `$regex` inputs are length-capped and regex-escaped server-side (no ReDoS via user input).
- Use parameterised queries / ORM; no string-built SQL.
- HTTPS only; no cleartext traffic.
- CORS restricted to known origins; a wildcard origin (`*`) is never combined with `credentials: true`.
- Return generic error messages; no stack traces to clients. Database `check_violation` details are logged server-side only; clients get a generic constraint message.
- Money-moving endpoints are rate limited beyond the global guard: payment initiation (30/min) and wallet mutations — top-up, transfer, withdrawal, cash-in (10/min).

## Money protection (order/ride transitions)

- Status transitions that trigger money legs are compare-and-set (`findOneAndUpdate` on the expected current status); a concurrent duplicate gets a 409 instead of double-applying side effects.
- Wallet ledger rows are the source of idempotency: earnings, fare debits and cancellation refunds are named after the unique order/ride number and checked before crediting/debiting, so retries never pay twice.
- Rider cash-in is capped server-side by un-deposited COD collections (delivered cash orders minus prior cash-in credits in the ledger); client-sent amounts above the computed ceiling are rejected.
- Never trust client-sent totals; all amounts are computed server-side.

## Data protection

- Collect minimum personal data (name, phone, address).
- Do not log PII, tokens, or payment data.
- Backups encrypted; restricted access.

## Mobile app

- Enable code shrinking/obfuscation in release builds.
- No debug logs in release.
- Certificate pinning optional for payment calls.
- The APK ships customer and rider screens only — admin screens live on the
  web panel, so admin-only APIs are never reachable from a stolen app binary.

## Checklist before release

- [ ] No secrets in repo
- [ ] Auth + role checks tested
- [ ] Payment callbacks verified
- [ ] Rate limits on
- [ ] Dependencies audited
