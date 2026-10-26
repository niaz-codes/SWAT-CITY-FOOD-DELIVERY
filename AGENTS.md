# AGENTS.md — AI Agent Entry Point

Read this file FIRST. It tells you how the Swat City Food Delivery project is organised and what rules to follow.

## Project in one line

Food delivery platform for Swat (Mingora and nearby areas): customers order from local restaurants, riders deliver, admins manage everything.

## Read order

1. `README.md` — overview
2. `docs/ARCHITECTURE.md` — structure and modules
3. `docs/ORDER_FLOW.md` — order lifecycle
4. `docs/PAYMENTS.md` — payment methods
5. `docs/SECURITY.md` — mandatory security rules
6. `docs/API.md`, `docs/DATABASE.md` — contracts
7. `docs/CODING_STANDARDS.md`, `docs/DEDUPLICATION.md` — how to write/clean code

## Golden rules

- Never hardcode secrets, API keys, or merchant credentials. Use environment variables.
- Never trust client-side prices or totals; recalculate on the server.
- Before writing new code, search for an existing function/widget/class that does the job (see `docs/DEDUPLICATION.md`).
- Do not change payment or auth logic without updating `docs/PAYMENTS.md` / `docs/SECURITY.md`.
- Update the relevant `.md` file whenever behaviour changes.
- Keep changes small; one concern per commit.

## When unsure

Ask the developer (Niaz) instead of guessing about business rules, pricing, or payment credentials.

## Full docs list

- `docs/AI_PROMPTS.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/CHANGELOG.md`
- `docs/CODING_STANDARDS.md`
- `docs/CONTRIBUTING.md`
- `docs/COUPONS_AND_PROMOTIONS.md`
- `docs/DATABASE.md`
- `docs/DEDUPLICATION.md`
- `docs/DELIVERY_ZONES.md`
- `docs/DEPLOYMENT.md`
- `docs/ERROR_HANDLING.md`
- `docs/FAQ.md`
- `docs/FEATURES.md`
- `docs/GLOSSARY.md`
- `docs/LOCALIZATION.md`
- `docs/LOGGING_AND_MONITORING.md`
- `docs/NOTIFICATIONS.md`
- `docs/ORDER_FLOW.md`
- `docs/PAYMENTS.md`
- `docs/PRICING_AND_FEES.md`
- `docs/PRIVACY_POLICY.md`
- `docs/REFUNDS_AND_CANCELLATIONS.md`
- `docs/RESTAURANT_ONBOARDING.md`
- `docs/RIDER_MANAGEMENT.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
- `docs/TERMS_AND_CONDITIONS.md`
- `docs/TESTING.md`
- `docs/UI_UX_GUIDELINES.md`
- `docs/USER_ROLES.md`
