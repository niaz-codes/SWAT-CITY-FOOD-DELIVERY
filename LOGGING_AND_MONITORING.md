# Logging & Monitoring

## Log

- Request id, user id (not PII), endpoint, status, duration
- Order status changes, payment events, admin actions

## Never log

- Passwords, OTPs, tokens, full card/wallet data, full phone numbers

## Monitoring

- Uptime check on health endpoint
- Alerts: error rate spike, payment failures, order stuck >15 min in one status
- Crash reporting for mobile (e.g. Firebase Crashlytics)
- Weekly review of slow queries
