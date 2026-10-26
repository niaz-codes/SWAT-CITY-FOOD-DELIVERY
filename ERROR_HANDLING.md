# Error Handling

## API error format

Every failed request answers with the same envelope, so the client can always
read the reason and the request id:

```json
{ "success": false, "message": "Enter a valid Pakistani mobile number (03xxxxxxxxx)", "requestId": "c8bba014-..." }
```

A successful request answers with `{ "success": true, "data": { ... } }`.

## Status codes that matter on the sign-in path

| Code | Meaning | What the app shows |
|------|---------|--------------------|
| `401` | Wrong code, wrong password, expired verification session | "That code is not right. Try again." |
| `409` | The email or the phone is already registered | "That email is already registered. Try signing in." |
| `415` | The photo is not an accepted type | "Only JPG, PNG, WEBP, PDF, GIF or HEIC files are allowed" |
| `422` | A field failed validation | The field message, e.g. "Enter a valid CNIC (xxxxx-xxxxxxx-x)" |
| `429` | Too many attempts in the request window | "Too many attempts. Please try again in 15 minutes." |
| `502` | The request was understood but the mail provider refused the code | "We could not send the verification email. Please try again in 54 seconds." |

An **operational** error (`AppError`) keeps its own status code and its own
message - the client can act on both. An unexpected failure keeps a generic
`500 Internal server error` so no internals leak. The request id is logged on
the server and returned to the client.

## Client rules

- The message from the server is shown as-is; it is written for the user.
- A failed form shows the reason **in the form** (an inline banner), not only in
  a toast, which disappears before it has been read.
- Network errors: show retry; cache last data where possible.
- Never show raw exceptions or stack traces to users.
- Server logs full error with request id; client shows only the message.
