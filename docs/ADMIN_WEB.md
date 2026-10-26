# Admin Web Panel

## Overview
The admin web panel is a separate React + Vite + Tailwind application that provides administrative control for the Swat City Food Delivery platform. It is a client of the same backend API the mobile app uses, and admin functionality is kept separate from the mobile app (customers and riders only).

## Tech Stack
- **Frontend**: React 19 + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod validation
- **Data Fetching**: Axios
- **UI Components**: Lucide React icons, Sonner (toasts)
- **Backend**: Same Node.js/Express API (no rewrites)
- **Database**: Supabase Postgres, reached **only** through the API

## Project Structure
```
admin-web/
├── src/
│   ├── components/
│   │   ├── ui/          # Design-system primitives (Button, Card, Field, Modal, …)
│   │   ├── charts/      # Theme-aware Recharts wrappers
│   │   ├── DataTable.tsx
│   │   └── CommandPalette.tsx
│   ├── layouts/         # App shell: sidebar, topbar, mobile drawer
│   ├── lib/             # API client, formatters, list/search hook, navigation
│   ├── pages/           # One component per screen
│   ├── stores/          # Zustand stores (auth, theme)
│   └── App.tsx          # Routes, admin guard, error boundary, toaster
├── .env.example         # Environment variables template
└── vite.config.ts       # Vite configuration
```

## Authentication
The panel signs in through the backend API, the same way the mobile app does:

1. `POST /api/auth/login/email` with email + password → the backend emails a 6-digit code and answers with a `challengeToken`.
2. `POST /api/auth/otp/email/verify` with `challengeToken` + the code → the API's access/refresh token and the account.
3. The access token is sent as `Authorization: Bearer <token>` on every request; `GET /api/auth/me` restores the session on reload.

Consequences worth knowing:
- The role is read from the API response (`role` must be `admin`), never from the browser.
- The backend enforces the role on every admin route, so the check in the browser is a convenience, not the guard.
- The panel does **not** use Supabase Auth and does **not** read Supabase tables. The publishable key is not needed and is not shipped to the browser.

### The code screen
Step 1 does not log anyone in - it only asks the backend to mail a 6-digit code. The panel keeps that half-finished login in `localStorage` (`otpChallenge`) so the code screen survives a reload, a slow connection or a closed tab. From there the admin can:

- type the code (`Verify code`),
- ask for another code (`Send a new code` → `POST /api/auth/otp/email/resend`),
- or start over with a different account (`Use a different account`).

Every failure is shown **in the page**, not only as a toast: a 429 says the codes are used up and to wait, a 502/500 says the mail could not be sent and to try again in a moment, and an expired code sends the admin back to the password step with a clear reason. The API's own request timeout is 45 s because sending a code routinely takes 5-8 s.

When the mail provider is merely cooling down (it answers `500` today, `502` once the backend change below is deployed) the panel **retries by itself** after 12 s, 22 s and 30 s and says when the next attempt happens. A wrong code no longer signs the admin out: the `401` handler skips the login endpoints, so a mistyped code leaves the code screen alone.

### Known API limits (fixed in the backend, pending deploy)
- Supabase refuses a second code for the same address while its own cooldown runs (`over_email_send_rate_limit`). The backend now answers **502** with the real message ("try again in N seconds") instead of a blanket 500, and re-uses a code that was sent less than a minute ago instead of mailing another one.
- The API allows 5 codes per address per 15 minutes. Beyond that it answers **429** with a wait message.

Until that backend change is deployed, a second "Sign in" within about a minute can still fail with 502 - the panel now says so instead of failing silently.

## Features
Every screen reads the **live API** and every button writes to it - there is no placeholder screen and no sample data.

| Screen | What it does |
| --- | --- |
| Dashboard | Totals, today's numbers, 7-day revenue/order chart, customer/rider growth, recent orders and the pending work queue (`GET /admin/dashboard`, recent rows from `GET /admin/orders?limit=6`) |
| Orders | Every order with customer, restaurant, rider, items, total and status; filter by status, search by order number, open detail, advance status, cancel while allowed and assign a rider (`GET/PATCH /admin/orders`, `…/:id/status`, `…/:id/assign-rider`) |
| Rides | Every ride with customer, rider, route, fare and status; filter by status, open detail and cancel an active ride with a reason (`GET /admin/rides`, `POST …/:id/cancel`) |
| Restaurants | Full CRUD: details, fees, hours, location, cover photo upload, open/busy/closed toggle and soft delete (`/admin/restaurants`, `…/:id/upload`) |
| Menu | Dishes per kitchen with price editing, inline availability switch, photo upload and soft delete; category list with create/edit/deactivate (`/admin/food`, `/admin/categories`) |
| Riders | Applications, approved photo upload, bike-number edit, vehicle-change approval, documents, approve/reject with a reason, suspend and reactivate (`/admin/riders`, `…/:id/*`) |
| Customers | Every customer account with phone, verification, status and last sign-in; suspend/activate (`GET /admin/users?role=customer`, `PATCH /admin/users/:id/status`) |
| Payments | Amount, method, gateway, reference and state; filter by status/method (`GET /admin/payments`) |
| Wallets | Every wallet with balance and owner; open a wallet to read its transactions (`GET /admin/wallets`, `…/:userId`) |
| Withdrawals | Requests with the payout lifecycle (approve, process, pay with a reference, reject and refund); search and filter by status (`GET/POST /admin/withdrawals`) |
| Promotions | Codes, value, minimum order, audience, usage and validity; create, edit, delete (`/admin/promotions`) |
| Notifications | Broadcast history with audience, recipients and push count; send a broadcast to everyone, customers or riders (`GET/POST /admin/notifications`) |
| Support | Ticket queue, filter by status, open a thread, add an admin reply and change status/priority (`/admin/support`, `PATCH /admin/support/:id`) |
| Reports | Revenue, orders, rides, food share, top restaurants, top dishes and the service split over a chosen period (`GET /admin/reports`) |
| Settings | Every runtime key the app reads; edit a value in place (text, number, on/off or JSON) and add a new key (`GET/POST /admin/settings`, `PATCH …/:key`) |

The list screens share `src/lib/useListResource.ts`: it sends paging, search and every selected filter to the API, debounces typing, recovers the newest response when two overlap, and resets paging when a filter changes. `src/components/DataTable.tsx` renders those rows as a sortable table with a sticky header on desktop and one card per row on a phone.

## Design system and theme
- A small UI kit in `src/components/ui/` (Button, Card, Badge, Field/Input/Select/Textarea/Switch/Checkbox, Modal, Drawer, Tabs, Pagination, States, PageHeader, StatCard, Avatar, Dropdown) keeps spacing, radii, focus rings and states consistent.
- Colours are semantic CSS variables in `src/index.css` (`canvas`, `surface`, `line`, `ink`, `brand`, `positive`, `warning`, `danger`, `info`) exposed through `tailwind.config.js`. Changing a token re-themes every screen.
- Light, dark and system themes are supported. The choice is stored in `localStorage` under `admin-theme`; a small inline script in `index.html` applies it before the first paint so there is no flash, and `src/stores/themeStore.ts` keeps "system" in sync with the OS.
- Layouts adapt from a collapsible desktop sidebar to a mobile drawer, tables become cards, and dialogs/drawers trap focus, close on Escape and restore focus when they close. `prefers-reduced-motion` is respected.
- Loading, empty and error states are explicit on every screen; destructive actions ask for confirmation first.

## Known backend dependency
Support-ticket replies need the `supportStatusSchema` fix in `backend/src/validations/admin.ts` (it now declares `reply`). Until the backend is redeployed, the panel shows the reply in its own thread but production will not persist it.


## Security
- Row Level Security is enabled on every table with **zero policies** (see `backend/supabase/schema.sql`), so the publishable key cannot read or write anything - all data access goes through the API.
- The service role key never leaves the backend.
- The backend derives the role from the database row, never from a token claim.
- Rate limiting and input validation are applied by the API on every admin route.
- The Vercel project has **Deployment Protection** (Vercel Authentication) enabled. The production alias `https://admin-web-seven-vert.vercel.app` answers directly; the older alias and the per-deployment URLs redirect to a Vercel sign-in page first. Use the production alias.

## Environment Variables
```env
VITE_API_BASE_URL=<backend_api_url>
```
The base URL includes the `/api` prefix, e.g. `https://backend-production-73f5.up.railway.app/api`. The same host the mobile app uses, so panel and app always show the same data. On Vercel this is a project environment variable (production + preview); locally it lives in `admin-web/.env`.

## Development
```bash
cd admin-web
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deployment
The panel is deployed to Vercel (`admin-web` project, Vite preset). Deploy from the `admin-web` directory:
```bash
vercel --prod
```
Live URL: `https://admin-web-seven-vert.vercel.app`

The Vercel project carries one environment variable, `VITE_API_BASE_URL`, for production and preview. A build without it ships a bundle that throws on import, which shows as a blank white page - if that happens, check the project environment variables before anything else.
