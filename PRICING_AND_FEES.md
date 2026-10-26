# Pricing & Fees

```
total = subtotal + delivery_fee + service_fee - discount
```

| Item                  | Rule (set real values)           |
| --------------------- | -------------------------------- |
| Delivery fee          | Base Rs. __ + Rs. __/km, by zone |
| Service fee           | Flat Rs. __ or __%               |
| Minimum order         | Rs. __ (per restaurant/zone)     |
| Free delivery         | Above Rs. __ (optional)          |
| Restaurant commission | __% per order                    |
| Rider payout          | Rs. __ per delivery + bonus      |

## Rules

- All amounts in PKR as integers (no floats).
- Server is the only source of truth for totals.
- Show a full price breakdown before payment.
- Rounding: nearest Rs. 1.
