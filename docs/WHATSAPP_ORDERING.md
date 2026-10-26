# WhatsApp ordering (customer app)

WhatsApp is an **alternative ordering channel**, not a payment method. Nothing in
the WhatsApp flow creates an app order, charges the wallet/gateway, or changes an
order status — the buttons only open a chat with a pre-filled order summary, and
the restaurant confirms the details (availability, total, delivery time) in chat.

## Configured numbers

| Priority | Number (local) | Note                        |
| -------- | -------------- | --------------------------- |
| Primary  | 03450050667    | Fastest reply during hours  |
| Secondary| 03453232555    | Backup when primary is busy |

Both live in `src/utils/whatsapp.ts` (`WHATSAPP_CONTACTS`). To change them,
edit only that array — every screen and the chooser read from it. The first
entry is always offered to the customer first and badged PRIMARY.

## Number format rules

`normalizePkMobile()` converts Pakistani mobile spellings into the digits-only
international form `wa.me` requires (`92` + 10 digits, e.g. `923450050667`).
Accepted inputs for the same number: `03450050667`, `+92 345 0050667`,
`92-345-0050667`, `0092 345 0050667`, `(92)3450050667`, bare `3450050667`.
Anything that is not a valid Pakistani mobile returns `''` and **no link is
built** — the same rule as the backend `phoneRegex`. Empty names or amounts are
rounded through `formatRs` (`Rs 1,599`, Hermes-safe manual grouping).

## Link format

All buttons open `https://wa.me/<12 digits>?text=<message>` — the universal
format: deep-links into the installed app on Android and iOS, and opens
web WhatsApp in a browser. Messages are URL-encoded with `encodeURIComponent`.
Link opening happens only in `WhatsAppContactDialog` (`Linking.openURL`) and
shows a toast when no WhatsApp/browser handler is available.

## Where the buttons are

| Screen                     | Control                                        | Message content |
| -------------------------- | ---------------------------------------------- | --------------- |
| Food details (`FoodDetails`) | Compact icon button beside quantity stepper | Restaurant, dish x qty, unit price + line total |
| Restaurant page (`Restaurant`) | Full-width "Order on WhatsApp" under hero | Restaurant name, general order enquiry |
| Cart (`Cart`)              | Ghost "Order via WhatsApp" under Checkout      | Full basket: per-item lines, subtotal, delivery fee, order total |
| Tracking/confirmation (`OrderTracking`) | Compact icon beside Cancel / Back-to-home | Order lines, total, placed time, current status |

All four open the same **contact chooser** (`WhatsAppContactDialog`): the two
configured lines with PRIMARY badge on the first, and the summary already typed.
The chooser is the single place that builds and opens the link.

## Reusable pieces

- `src/utils/whatsapp.ts` — pure helpers + contact config (no RN imports, so it
  is unit-testable in plain node).
- `src/components/WhatsAppButton.tsx` — the reusable CTA (`solid` filled green,
  `ghost` outline, `compact` icon-only 54x54). Reuses the single
  `assets/whatsapp.png` brand icon; never duplicate that image.
- `src/components/WhatsAppContactDialog.tsx` — primary/secondary chooser +
  the only place that opens the `wa.me` link.

## Tests

`npx tsx scripts/test-whatsapp-links.ts` (24 assertions) covers: both configured
numbers, all spelling variants converging, invalid numbers rejected, wa.me URL
format round-trip, and every message template containing restaurant name,
item lines, quantity, price and totals. Typecheck: `npm run typecheck`.
