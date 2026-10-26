# Delivery Zones (Swat)

Initial service areas (edit to match reality):

- Mingora
- Saidu Sharif
- Fizagat
- Kanju
- Manglawar
- Barikot (planned)
- Madyan / Bahrain / Kalam (future)

## Zone fields

`id, name, polygon/centre+radius, base_fee, per_km_fee, min_order, is_active`

## Rules

- Customer address must fall inside an active zone, otherwise block checkout.
- Delivery fee computed on the server from zone + distance.
- Weather/road closures: admin can disable a zone temporarily.
