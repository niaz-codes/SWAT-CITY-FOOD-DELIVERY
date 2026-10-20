# Rider Management

## Onboarding

- CNIC copy, phone, bike/vehicle info, photo
- Admin verification before activation

## Vehicle & base location changes

- A rider may switch vehicle type (bike/rickshaw/van/sedan) and update the
  registration number from **My vehicle** in the app.
- Vehicle changes are **admin-approved**: the rider's proposal is stored on the
  profile as `pendingVehicle` and the live vehicle fields (used by dispatch and
  the admin map) only change when an admin approves it. Until then the current
  vehicle stays active.
- Registration numbers must be unique across riders. The check normalises case
  and strips spaces/hyphens, so `swat-1234` and `SWAT 1234` collide. A plate
  already held by another rider — live or pending — is rejected.
- A rider's **base location** (the pin they drop on the map at registration or
  later from **Base location**) is saved per profile; it is not approval-gated
  and never moves another rider's base.
- Admin review lives in the rider detail sheet (Riders screen): a pending change
  shows the requested values, and Approve / Reject decide it. Approve re-checks
  the plate, because another rider may have taken it while the request waited.

## Assignment

- Nearest available rider first; timeout then next rider
- Manual reassignment by admin

## Cash handling (COD)

- Rider records cash at delivery
- Daily settlement with admin; mismatches flagged

## Performance

- Acceptance rate, delivery time, ratings, complaints
- Warnings/suspension policy documented

## Privacy

- Location shared only during active delivery.
