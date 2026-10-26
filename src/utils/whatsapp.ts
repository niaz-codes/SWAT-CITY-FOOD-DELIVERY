/**
 * WhatsApp ordering support (customer side).
 *
 * WhatsApp is an *alternative ordering channel*, not a payment method:
 * nothing in here creates an app order, charges anything, or flips a status.
 * Every button opens a `wa.me` chat with a pre-filled summary and the
 * restaurant confirms the details in chat, exactly like a phone order.
 *
 * This module is deliberately dependency-free (no react-native imports) so it
 * stays unit-testable with plain node (`npx tsx scripts/test-whatsapp-links.ts`).
 * Opening the link happens in the components, which own `Linking`.
 */

/** A configured WhatsApp line the customer may contact. */
export interface WhatsAppContact {
  /** Local Pakistani number exactly as configured (03XXXXXXXXX). */
  local: string
  /** Label shown in the contact chooser. */
  label: string
  /** One line about what this line is for. */
  description: string
}

/**
 * The WhatsApp order lines. The first entry is treated as the primary
 * contact and is offered first; to re-order the lines, change this array
 * only — every screen reads from here.
 */
export const WHATSAPP_CONTACTS: WhatsAppContact[] = [
  {
    local: '03450050667',
    label: 'Primary order line',
    description: 'Fastest reply during opening hours.',
  },
  {
    local: '03453232555',
    label: 'Secondary order line',
    description: 'Backup when the primary line is busy.',
  },
]

/**
 * Pakistani mobile format, deliberately the same rule the backend enforces
 * (`phoneRegex` in backend/src/validations/common.ts): 03XXXXXXXXX local,
 * +92/92/0092 international, or even bare 3XXXXXXXXX. Spaces, dashes and
 * brackets are tolerated because customers type numbers every possible way.
 */
const PK_MOBILE = /^(?:\+92|92|0092|0)?3\d{9}$/

/**
 * Normalises a Pakistani mobile number to the digits-only international form
 * wa.me expects (92 + 10 digits = 12 digits). Returns '' for anything that is
 * not a Pakistani mobile — callers treat '' as "invalid, do not open chat".
 */
export function normalizePkMobile(raw: string): string {
  const clean = String(raw ?? '').replace(/[\s()-]/g, '')
  if (!PK_MOBILE.test(clean)) return ''
  const digits = clean.replace(/\D/g, '')
  if (digits.startsWith('0092')) return digits.slice(2)
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return `92${digits.slice(1)}`
  return `92${digits}`
}

/** A wa.me deep link. Universal: opens the app on Android/iOS, web chat on web. */
export function waMeLink(numberIntl: string, messageText: string): string {
  return `https://wa.me/${numberIntl}?text=${encodeURIComponent(messageText)}`
}

/** Compact "Rs 1,599" money text for chat messages (manual grouping: Hermes-safe). */
function formatRs(amount: number): string {
  const n = Math.max(0, Math.round(Number(amount) || 0))
  return `Rs ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** One item line: "2 x Chapli Karahi (Rs 450 each) = Rs 900". */
function itemLine(name: string, quantity: number, unitPrice: number): string {
  const qty = Math.max(1, Math.round(Number(quantity) || 1))
  const each = qty > 1 ? ` (Rs ${Math.round(Number(unitPrice) || 0)} each)` : ''
  return `${qty} x ${String(name || 'Item')}${each} = ${formatRs((Number(unitPrice) || 0) * qty)}`
}

export interface MenuOrderDraft {
  restaurantName: string
  itemName: string
  quantity: number
  itemPrice: number
}

/** Pre-fill for the single-dish button on the food details screen. */
export function buildSingleItemMessage(d: MenuOrderDraft): string {
  return [
    'Hi! I want to order food through the Swat City Food Delivery app.',
    '',
    `Restaurant: ${d.restaurantName}`,
    '',
    'Order details:',
    itemLine(d.itemName, d.quantity, d.itemPrice),
    '',
    'Please confirm availability, total and delivery time.',
  ].join('\n')
}

export interface CartOrderDraft {
  restaurantName: string
  items: { name: string; quantity: number; unitPrice: number }[]
  subtotal: number
  deliveryFee: number
  total: number
}

/**
 * Pre-fill for the cart button: the complete basket so the recipient can
 * read the request without asking follow-up questions.
 */
export function buildCartMessage(d: CartOrderDraft): string {
  const lines: string[] = [
    'Hi! I want to order food through the Swat City Food Delivery app.',
    '',
    `Restaurant: ${d.restaurantName}`,
    '',
    'Order details:',
  ]
  for (const it of d.items) lines.push(itemLine(it.name, it.quantity, it.unitPrice))
  lines.push(
    '',
    `Items total: ${formatRs(d.subtotal)}`,
    `Delivery fee: ${d.deliveryFee > 0 ? formatRs(d.deliveryFee) : 'FREE'}`,
    `Order total: ${formatRs(d.total)}`,
    '',
    'Please confirm my order. Thank you!',
  )
  return lines.join('\n')
}

/** Pre-fill when the customer is browsing a kitchen and wants to chat to order. */
export function buildBrowseMessage(restaurantName: string): string {
  return [
    'Hi! I am viewing your kitchen on the Swat City Food Delivery app.',
    '',
    `Restaurant: ${restaurantName}`,
    '',
    'I want to place an order - please share what is available today, the prices and the delivery time to my area.',
  ].join('\n')
}

export interface PlacedOrderDraft {
  restaurantName: string
  items: { name: string; quantity: number; unitPrice: number }[]
  total: number
  statusLabel: string
  placedAt: Date
}

/**
 * Follow-up chat for an order that already exists in the app (confirmation /
 * tracking screen). The summary helps the kitchen connect an app order to the
 * chat without asking "which order?".
 */
export function buildOrderFollowUpMessage(d: PlacedOrderDraft): string {
  const lines: string[] = [
    'Hi! I placed a food order in the Swat City Food Delivery app.',
    '',
    `Restaurant: ${d.restaurantName}`,
    '',
    'Order details:',
  ]
  for (const it of d.items) lines.push(itemLine(it.name, it.quantity, it.unitPrice))
  lines.push(
    '',
    `Order total: ${formatRs(d.total)}`,
    `Placed at: ${d.placedAt.toLocaleString()}`,
    `Current status: ${d.statusLabel}`,
    '',
  )
  if (d.statusLabel.toLowerCase() === 'delivered') {
    lines.push('I want to share feedback about this order.')
  } else {
    lines.push('I want to ask about my delivery.')
  }
  return lines.join('\n')
}
