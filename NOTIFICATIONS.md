# Notifications

## Channels

- Push (FCM) — primary
- SMS — OTP and critical fallback
- In-app inbox

## Events

| Event                               | Recipient       | Channel    |
| ----------------------------------- | --------------- | ---------- |
| Order placed                        | Restaurant      | Push       |
| Order confirmed / preparing / ready | Customer        | Push       |
| Rider assigned                      | Customer, Rider | Push       |
| Picked up / Delivered               | Customer        | Push       |
| Payment success/failed              | Customer        | Push       |
| Refund processed                    | Customer        | Push + SMS |

## Rules

- One `NotificationService`; no per-screen custom push code.
- Store device tokens per user; remove invalid tokens.
- Respect user opt-out for promotional messages.
- Never put sensitive data (OTP, payment info) in push body.
