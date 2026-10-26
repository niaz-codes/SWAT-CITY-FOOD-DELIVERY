# Refunds & Cancellations

## Cancellation windows

| Stage                                  | Customer can cancel? | Refund       |
| -------------------------------------- | -------------------- | ------------ |
| PLACED                                 | Yes                  | Full         |
| CONFIRMED                              | Yes (limited)        | Full/partial |
| PREPARING+                             | No (contact support) | Case by case |
| Restaurant rejects / rider unavailable | Auto-cancel          | Full         |

## Refund process

1. Request created with reason.
2. Admin reviews and approves.
3. Refund to original method (wallet/card) or credit; COD orders need no refund unless prepaid.
4. Customer notified; record actor, amount, time.

## Rules

- Refund amount can never exceed amount paid.
- Each refund is idempotent and logged.
