# API Reference (template)

Base URL: `https://api.example.com/v1`
Auth: `Authorization: Bearer <token>`
Response format: `{ "success": true, "data": {...} }` or `{ "success": false, "error": { "code": "", "message": "" } }`

## Auth

- `POST /auth/send-otp`
- `POST /auth/verify-otp`
- `POST /auth/refresh`

## Restaurants

- `GET /restaurants?area=&q=&page=`
- `GET /restaurants/{id}/menu`

## Orders

- `POST /orders`
- `GET /orders/{id}`
- `GET /orders?status=`
- `PATCH /orders/{id}/status` (restaurant/rider/admin)
- `POST /orders/{id}/cancel`

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

> Keep this file in sync with real endpoints.
