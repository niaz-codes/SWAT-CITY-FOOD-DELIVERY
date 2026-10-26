# Development seed data

`npm run seed` only ensures the bootstrap admin account exists. To exercise the
customer, rider and admin flows locally, use the **development-only** seed:

```powershell
cd backend
$env:SEED_DEV_DATA = "true"
npm run seed:dev
```

Two independent guards keep it away from production:

1. `NODE_ENV=production` is refused outright.
2. `SEED_DEV_DATA=true` must be set explicitly.

Before it writes anything it prints the target Supabase host. **Check that host
is your development project, not production.**

## What it creates

| Record | Details |
| --- | --- |
| Customer | `dev.customer@swatcity.local` / `DevCustomer123`, verified, with a saved address and wallet |
| Rider | `dev.rider@swatcity.local` / `DevRider123`, verified, approved and online, with a rider profile and wallet |
| Restaurants | `Swat Grill (Dev)` and `Mingora Bites (Dev)`, each with four menu items |
| Orders | One delivered, one pending and one ready (unassigned, so it appears in the rider feed) |

The seed is idempotent: re-running repairs the same accounts, restaurants and
menu items instead of duplicating them. Sample orders are only created when the
dev customer has no orders yet.

These credentials are well-known and must never be used outside a development
database. Delete the rows or point `SUPABASE_URL` at a fresh local project when
you are done.
