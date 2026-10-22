You are working inside the "Swat City Food Delivery" project. First inspect the whole repository (README, docs/*.md, package.json / pubspec.yaml / build files, backend, admin panel code, env files) and identify the actual stack, the apps that exist (customer app, rider app, restaurant app, admin panel, backend API) and what is already built. Preserve working features and conventions. Do not invent features, payment providers, or legal facts that are not in the repo; where something is unknown, list it under "Needs my input".

GOAL
Make the ADMIN PANEL production-ready as (a) a responsive web page and (b) an installable app (PWA), and prepare the project so the customer app (and admin app if desired) can be published on Google Play with all required policy pages and documentation.

1. ADMIN PANEL: WEB + MOBILE READY
- Responsive, mobile-first UI. Tables become cards on small screens; touch targets 44px+; sticky top bar; dark/light safe contrast; keyboard accessible; loading skeletons, empty states, error states with Retry.
- Cover only the modules that exist or are clearly needed for a delivery business, and build the missing ones minimally: dashboard (today's orders, revenue, active riders), orders (live list, status changes: placed, accepted, preparing, out for delivery, delivered, cancelled), restaurants and menu management (items, prices, availability toggles), riders, customers, delivery areas/fees, and admin users with roles (super admin, staff).
- Real-time or auto-refreshing order list with a sound/visual alert for new orders.
- Security: server-side auth on every admin route and API, hashed passwords, role-based access, rate limiting on login, input validation, CSRF/same-origin checks, httpOnly secure cookies, audit log of sensitive actions (refunds, price changes, role changes), no secrets in client code. Add robots noindex for admin pages.

2. PWA / INSTALLABLE ADMIN APP
- Web manifest (name, short_name, start_url, scope, standalone display, theme/background colors), original icons (192, 512, maskable 512, apple-touch 180) generated from the project's existing logo or a simple original mark, and screenshots if feasible.
- Service worker: cache static shell + offline page only. NEVER cache API responses, orders, customer data, or authenticated HTML.
- "Install app" button using beforeinstallprompt, hidden when already installed.

3. LEGAL + POLICY PAGES (public, mobile-friendly, linked from app and website footer)
- /privacy-policy: must reflect what this app REALLY collects. Inspect the code and list it accurately (e.g. name, phone, email, delivery addresses, location, order history, payment info handled by which provider, device identifiers, push tokens, crash/analytics SDKs), purposes, storage location and processors, retention, sharing with restaurants and riders, user rights, children's privacy, contact info, last-updated date.
- /terms: ordering terms, accuracy of menu/prices, delivery times as estimates, cancellation and refund rules (use what the project docs say; otherwise mark as "Needs my input"), payment terms (cash on delivery or other methods that actually exist), account responsibilities, acceptable use, liability limits, governing law (Pakistan), changes, contact.
- /refund-policy and /delivery-policy if the business logic supports them.
- /delete-account: public page explaining how users request account and data deletion, plus an in-app "Delete my account" flow in the customer app (Google Play requires both for apps that allow account creation). Implement the backend endpoint that deletes or anonymizes personal data while keeping legally required order records.
- Keep all legal text, dates and contact details in one data file so they are easy to edit. Add a note that these are templates and should be reviewed by a qualified lawyer.

4. GOOGLE PLAY READINESS (customer app, and admin app if wrapping the PWA)
- Audit the Android/Flutter project: applicationId, versionCode/versionName, targetSdk meeting the current Play requirement, release signing config (keystore kept out of git), ProGuard/R8, app icons, adaptive icon, splash screen, permissions (remove unused ones; location, notifications, camera only if used, with runtime rationale screens), network security config (HTTPS only), no hard-coded API keys, debug flags off.
- Build an .aab release and document the command.
- Create docs/PLAY_STORE.md with: store listing text (short and full description, in English and optionally Urdu), required graphics sizes (512 icon, 1024x500 feature graphic, phone screenshots), privacy policy and deletion URLs, Data safety form answers that match the real data collected, content rating answers, target audience, ads declaration, app access instructions with a test account for reviewers, location permission disclosure if used, and notes on payment policy (physical goods and delivery services may use external payment methods, but tell me to verify the latest Google Play policy).
- If wrapping the admin PWA as a Trusted Web Activity: add the assetlinks.json route and explain generating it with the signing fingerprint (including Play App Signing). Be honest that a private admin tool may be better distributed through internal testing or as a PWA, since thin website wrappers can be rejected.
- Remind me to check current Play Console testing requirements for new developer accounts.

5. QUALITY
- Run the project's lint, type-check, tests and build commands; fix issues. Find and remove duplicate code while doing this.
- Update the docs folder (README, SECURITY, PAYMENTS, DEPLOYMENT, PLAY_STORE) so other AI agents understand the project.
- Final summary: what changed, new routes/screens, every item under "Needs my input" (business name, address, support email/phone, domain, package name, refund rules, payment providers, signing fingerprint), and exact commands to run, build and deploy.