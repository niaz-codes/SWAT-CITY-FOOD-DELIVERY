# Testing

## Automated checks

| Command | What it covers |
|---------|----------------|
| `npm run typecheck` | The whole app (`tsc --noEmit`). |
| `npm run lint` | The whole app (`expo lint`). |
| `npm run export:android` | A production bundle of the Android app - the build that ships. |
| `cd backend && npm test` | The backend unit tests (Node test runner). |
| `cd backend && npm run typecheck` | The backend, including the test files. |
| `cd backend && npm run build` | The backend compiles to `dist/` the way the deployment builds it. |

### Backend test suite

`cd backend && npm test` runs the checks in `backend/tests/`:

- **Upload backend** - Cloudinary is only used when all three credentials are
  present; every other shape falls back to the project's own storage bucket.
  The mime types the app sends keep their extensions.
- **Rider registration payload** - the exact multipart body the Android app
  produces is accepted, and a wrong CNIC, phone, password, plate, vehicle type,
  experience or missing map location is refused with a reason.
- **Customer registration payload** - the sign-up body is accepted, an unknown
  role is not.
- **Code verification payload** - a six digit code is accepted, anything else is
  not.
- **Verification email guard** - a refused send becomes a retryable `502` that
  carries the provider's own waiting time, and a send that went out passes.

## End-to-end checks against a running backend

The live flow (rider registration with a photo, duplicate registration,
validation errors, the photo size limit, customer registration, login, code
verification, an expired code, resend) is exercised with a script that talks to
the API exactly as the app does and then removes the rows it created:

```bash
node live-auth-flow-test.js https://backend-production-73f5.up.railway.app/api
```

Run it against a local backend (`http://localhost:4010/api`) to check the
current code, and against the deployed one to check what is actually live.

## Manual checklist

- COD order, wallet payment success/failure, cancellation + refund, rider flow, poor network.
- Login, registration, code verification, code resend, a wrong code, an expired
  code, a duplicate registration - on a real Android device, not only the
  emulator.
- A photo larger than 5 MB (refused before it is uploaded), a PNG photo (kept as
  a PNG), a lost connection during the upload (a clear timeout, not a spinner
  that never ends).
- Run all tests before merging.
