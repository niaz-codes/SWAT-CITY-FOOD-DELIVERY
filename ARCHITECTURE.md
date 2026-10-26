# Architecture

## Layers

```
UI (screens/widgets/activities)
  -> State / ViewModel / Controller
    -> Repository / Service layer
      -> API client / Local DB
        -> Backend -> Database
```

## Suggested module layout

```
/auth        login, OTP, sessions
/restaurants listing, search, menu
/cart        cart logic (single source of truth)
/orders      create, track, history
/payments    COD, JazzCash, Easypaisa, card
/delivery    rider assignment, live status
/notifications push + SMS
/common      shared widgets, utils, constants, API client
```

## Rules

- Each feature lives in ONE module. Shared code goes in `/common`.
- UI never calls the API directly; go through repository/service.
- One API client, one error handler, one date/currency formatter.
- Business rules (fees, discounts) live on the backend; client only displays.

## Key entities

User, Restaurant, MenuItem, Cart, Order, OrderItem, Payment, Rider, Address, Coupon, Review.
