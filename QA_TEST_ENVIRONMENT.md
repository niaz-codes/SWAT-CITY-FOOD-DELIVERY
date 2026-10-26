# QA test environment

Created **22 Oct 2026** against the live production backend, database and Supabase Storage.
This file is a manifest only. Passwords and OTPs are **not** stored here; they are shared
separately with the developer.

## Environment

| Item | Value |
|------|-------|
| Production API | `https://backend-production-73f5.up.railway.app/api` |
| Supabase project | `ygdjwaxswftmzkcjzgna` |
| Storage bucket | `swat-city` (public read) |
| APK under test | `com.swatcity.delivery`, build `9a552988-e065-4c28-b58a-8685a0a4feee` (commit `2a7c630`) |
| Android device | `uos_test` emulator, Android 11 |
| Local verification backend | `http://localhost:4001` (real code, Cloudinary disabled so uploads use Supabase Storage) |

## Test accounts

All accounts are clearly named/labelled and use Gmail plus-address aliases on the
project inbox. Do not use them for real orders or real payouts.

| Role | Name | Email | Phone | State |
|------|------|-------|-------|-------|
| Customer | QA Customer (Test) | `niazkhan4371+probecustomer@gmail.com` | `03009999003` | verified, active |
| Rider | Asad QA Rider | `niazkhan4371+ridertest@gmail.com` | `03009999001` | verified, approved, offline |

IDs:

- Customer user: `2f56ce0d-1436-43b4-b179-93ec3ce8817b`
- Rider user: `dab62084-b876-4002-8037-bb06361e1cff`
- Rider profile: `9442579c-fe44-4fdb-bb5a-1211274599be`
- Rider plate: `SWAT-9001`
- Rider wallet: `d20598c9-00c4-49a8-91ea-a237aa823a29` (balance **Rs 96**, hold earnings on)

The real admin account (`niazkhan4371@gmail.com`) and the real developer customer
(`niazfreelancer123@gmail.com`) were not modified.

## Test restaurant and menu

| Item | Value |
|------|-------|
| Restaurant | `Swat Valley Bites (QA Test)` |
| Restaurant ID | `cd77dbe6-c2b3-43d2-87ba-6a90fe1066ff` |
| Area | Mingora, Swat (`34.9140, 72.3210`) |
| Status | open, featured |
| Cover image | Supabase Storage, HTTP 200 |
| Menu items | 13, all with Supabase-hosted images (HTTP 200) |

Menu:

| Dish | Category | Price (PKR) |
|------|----------|-------------|
| Zinger Burger | Burgers | 650 |
| Beef Smash Burger | Burgers | 850 |
| Chicken Fajita Pizza | Pizza | 1,250 |
| Margherita Pizza | Pizza | 950 |
| Chicken Biryani | Biryani & Rice | 550 |
| Mutton Pulao | Biryani & Rice | 750 |
| Loaded Fries | Fries | 450 |
| Club Sandwich | Sandwiches | 520 |
| Chicken Shawarma | Sandwiches | 350 |
| Mint Margarita | Drinks | 220 |
| Chilled Cola | Drinks | 120 |
| Chocolate Lava Cake | Desserts | 380 |
| Peri Peri Chicken Wings | Sides | 590 |

Food images are stored under `swat-city/food/...`; the restaurant cover is under
`swat-city/restaurants/...`; the rider application photo is under
`swat-city/riders/applications/...`.

## Orders exercised

Both orders are cash-on-delivery, belong to the test customer, and were delivered by
the test rider. No real money moved.

| Order | Number | Items | Total | Rider payout | Final status |
|-------|--------|-------|-------|--------------|--------------|
| `1c94388f-0298-4ad8-a4b4-6400f824a06b` | SWT-24A06B | 2× Zinger Burger, 1× Loaded Fries, 2× Mint Margarita | Rs 2,304 (incl. Rs 50 tip) | Rs 48 | delivered |
| `c4030bf3-c907-4046-80f9-b6d88b871f1a` | SWT-871F1A | 1× Chicken Shawarma, 2× Chilled Cola | Rs 654 | Rs 48 | delivered |

What each order covered:

1. **SWT-24A06B** - customer placed the order, admin moved it through
   `confirmed → preparing → ready`, admin assigned the rider, rider moved it through
   `picked_up → on_the_way → delivered`.
2. **SWT-871F1A** - customer placed the order, admin moved it to `ready`, the rider
   saw it in the open feed and self-accepted it, then completed the delivery.

The customer received a notification for every lifecycle step. The rider wallet
received two Rs 48 earnings entries (balance Rs 96).

## Verification summary

- Production public API returns the restaurant and all 13 menu items.
- All 13 food image URLs and the restaurant cover return HTTP 200 with `image/jpeg`.
- Customer APK login works; home shows the restaurant and the menu, and the API
  responds with the test data.
- The rider application was created with **pending** approval, then approved through
  the real admin API; the account flipped to approved only after that call.
- The fixed rider registration path was exercised against the live DB and bucket:
  valid registration `201`, duplicate `409`, missing photo `422`, invalid CNIC `422`,
  invalid plate `422`.
- Rider withdrawal is correctly refused below the Rs 500 minimum.

## Known limitations / observations

- **The backend fix is not deployed yet.** The live API still returns
  `403 new row violates row-level security policy` for rider registration until
  `cd backend && railway up` publishes the current backend. The live backend is also
  missing the admin vehicle-update route, so it is older than this working tree.
- The customer APK screens use gradient tiles plus food emoji and do **not** render
  `imageUrl` values (there is no `<Image>` for menu/restaurant cards in the current
  source). The images are stored and served correctly; displaying them would need an
  app UI change and a new APK.
- COD orders keep `paymentStatus: pending` after delivery. Settlement/cash
  reconciliation was not exercised, so this is reported as observed behaviour rather
  than changed.
- The rider earnings screen reports `completed: 2` but the profile's `totalTrips`
  remains `0`; the field is not updated on delivery. Reported, not changed.
- Admin web UI was exercised through the same admin APIs but not visually re-checked
  in a browser during this run.

## Cleanup

Keep this data while QA is active. To remove it later, delete in this order and only
for the IDs above:

1. `wallet_transactions` for the rider and customer.
2. `notifications` for the rider and customer.
3. `order_items` and `orders` for the two order IDs.
4. `addresses`, `carts` and `favorites` for the customer.
5. `wallets` for the rider and customer.
6. `rider_profiles` for the rider profile.
7. `food_items` for the 13 menu items, then the restaurant.
8. `users` for the two test accounts.
9. Storage objects under the test prefixes listed above.

Never delete the admin or the real customer.
