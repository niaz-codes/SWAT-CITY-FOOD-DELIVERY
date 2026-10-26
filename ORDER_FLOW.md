# Order Lifecycle

```
PLACED -> CONFIRMED (restaurant) -> PREPARING -> READY -> PICKED_UP (rider) -> DELIVERED
   \-> CANCELLED / REJECTED (allowed only before PICKED_UP)
```

| Status    | Set by                    | Notes                             |
| --------- | ------------------------- | --------------------------------- |
| PLACED    | Customer                  | Payment initiated or COD chosen   |
| CONFIRMED | Restaurant                | Timeout auto-cancels (e.g. 5 min) |
| PREPARING | Restaurant                |                                   |
| READY     | Restaurant                | Notify rider                      |
| PICKED_UP | Rider                     |                                   |
| DELIVERED | Rider                     | COD cash recorded here            |
| CANCELLED | Customer/Admin/Restaurant | Trigger refund if paid online     |

## Rules

- Status transitions are validated on the server only; invalid jumps are rejected.
- Every transition is logged with timestamp and actor.
- Pricing: subtotal + delivery fee + service fee - discount, all calculated server-side, in PKR.
