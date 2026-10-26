# API Reference (template)

Base URL: `https://backend-production-73f5.up.railway.app/api`
Auth: `Authorization: Bearer <token>`
Response format: `{ "success": true, "data": { ... } }` or `{ "success": false, "message": "...", "requestId": "..." }`

## Auth

Every email flow is two steps: the first asks for a code, the second confirms
it. **No session is issued before the code is confirmed**, so a password alone
is never enough to sign in.

- `POST /auth/login/email` — `{ email, password }` → a challenge token
- `POST /auth/otp/email/verify` — `{ challengeToken, otp }` → the session
- `POST /auth/otp/email/resend` — `{ challengeToken }` → a fresh challenge
- `POST /auth/register` — `{ name, phone, email, password, role }` → a challenge
- `POST /auth/register/rider` — `multipart/form-data` with the fields
  `name, phone, email, password, cnic, baseCity, vehicleType, vehiclePlate,
  experienceYears, latitude, longitude, locationLabel` and the photo in the
  field `photo` → a challenge. The photo must be a JPG, PNG, WEBP, GIF or HEIC
  file below 5 MB.
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- `POST /auth/google` — `{ idToken }`
- `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`

A rider account is created **pending**: `isApproved` stays `false` and
`pendingApproval` stays `true` until an admin approves it.

- `POST /auth/register/restaurant` — `{ name, phone, email, password,
  restaurantName, … }` → creates a `restaurant`-role account **and** its
  restaurant record together. The account starts unverified (email code) and
  the restaurant starts **unapproved** — hidden from the customer app until an
  admin approves it.

## Restaurant portal (`restaurant` role only)

Every route is scoped through the signed-in owner: none accepts a restaurant
id, so an owner can only ever touch their own kitchen.

- `GET /restaurant/me` — the owner's restaurant, account and today's stats
- `PATCH /restaurant/me` — editable profile fields (never platform flags)
- `POST /restaurant/me/upload` — `multipart/form-data` field `file`
- `GET /restaurant/menu`, `POST /restaurant/menu`,
  `PATCH/DELETE /restaurant/menu/{id}`,
  `POST /restaurant/menu/{id}/upload` — the owner's own dishes
- `GET /restaurant/orders?status=&page=`, `GET /restaurant/orders/{id}`
- `POST /restaurant/orders/{id}/advance` — `{ status: confirmed|preparing|ready }`
- `POST /restaurant/orders/{id}/cancel` — `{ reason }`, only while
  pending/confirmed/preparing
- `GET /restaurant/reports?range=today|7d|30d|quarter` — this restaurant's own
  numbers: `{ summary: { deliveredOrders, grossRevenue, avgOrder, pending,
  inKitchen, cancelled, rejected }, series: [{ date, orders, revenue }],
  topDishes: [{ id, name, qty, revenue }], popularIds }`. Revenue counts
  delivered orders only; dish popularity comes from the item snapshots of
  delivered orders (`id` is the food item id where the snapshot carries one).

## Restaurants

- `GET /restaurants?area=&q=&page=`
- `GET /restaurants/{id}/menu`

## Orders

- `POST /orders`
- `GET /orders/{id}`
- `GET /orders?status=`
- `PATCH /orders/{id}/status` (restaurant/rider/admin)
- `POST /orders/{id}/cancel` — `{ reason }` (required, min 3 chars); customers
  can cancel until the rider is assigned
- `POST /reviews` — `{ targetType: restaurant|food|rider|ride, targetId,
  rating, comment?, orderId? }`; order-backed reviews are purchase-verified
  server-side, one review per target per user (409 on duplicates)

## Payments

- `POST /payments/initiate`
- `POST /payments/callback/{provider}` (server-to-server)
- `GET /payments/{id}`

## Rider

- `GET /rider/available-orders`
- `POST /rider/orders/{id}/accept`
- `PATCH /rider/location`
- `GET /rider/profile`, `PATCH /rider/profile` (name/phone)
- `POST /rider/vehicle` — propose a vehicle type/brand/plate change (held for admin approval)
- `POST /rider/base-location` — save the base pin dropped on the map
- `GET /places/search?q=` — public place/area suggestions for the map search

## Admin — riders

- `PATCH /admin/riders/{id}/vehicle` — admin sets the confirmed plate directly
- `POST /admin/riders/{id}/vehicle/approve` — apply a rider's pending vehicle change
- `POST /admin/riders/{id}/vehicle/reject` — decline it; current details stay active

## Admin — restaurants

- `GET /admin/restaurants?search=&status=&approval=pending&page=` — lists every
  kitchen (with the owner account populated when one is linked)
- `POST /admin/restaurants` — create (approved instantly)
- `PATCH /admin/restaurants/{id}` — edit, plus admin-only `isApproved` and
  `ownerEmail` (links an existing `restaurant`-role account as the owner)
- `DELETE /admin/restaurants/{id}`, `POST /admin/restaurants/{id}/upload`

> Keep this file in sync with real endpoints.
