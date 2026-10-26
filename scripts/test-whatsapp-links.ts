/**
 * WhatsApp ordering — link and message tests (no emulator needed).
 *
 * Run from the repo root:
 *   npx tsx scripts/test-whatsapp-links.ts
 *
 * Asserts the exact pieces the customer-facing buttons depend on:
 *   1. Both configured numbers survive normalisation as +92-line digits.
 *   2. Local/+/92/0092 spelling variants of the SAME number all converge.
 *   3. Garbage and non-mobile numbers are rejected (never turned into a link).
 *   4. wa.me links are built in the universal format for Android/iOS/web.
 *   5. Every pre-filled message contains the required order facts.
 */
import assert from 'node:assert/strict';
import {
  WHATSAPP_CONTACTS,
  buildBrowseMessage,
  buildCartMessage,
  buildOrderFollowUpMessage,
  buildSingleItemMessage,
  normalizePkMobile,
  waMeLink,
} from '../src/utils/whatsapp';

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
};

// --- 1. Configured contacts normalise correctly -----------------------------
console.log('1. Configured contact numbers');
test('03450050667 -> 923450050667', () => {
  assert.equal(normalizePkMobile('03450050667'), '923450050667');
});
test('03453232555 -> 923453232555', () => {
  assert.equal(normalizePkMobile('03453232555'), '923453232555');
});
for (const contact of WHATSAPP_CONTACTS) {
  test(`contact ${contact.local} is a valid Pakistani mobile`, () => {
    const intl = normalizePkMobile(contact.local);
    assert.match(intl, /^92\d{10}$/);
  });
}

// --- 2. Spelling variants all converge on the same digits -------------------
console.log('2. Number-format normalisation');
for (const variant of [
  '03450050667',
  '+92 345 0050667',
  '92-345-0050667',
  '0092 345 0050667',
  '(+92)3450050667',
  '923450050667',
]) {
  test(`"${variant}" -> 923450050667`, () => {
    assert.equal(normalizePkMobile(variant), '923450050667');
  });
}
test('bare 3450050667 gets the country code', () => {
  assert.equal(normalizePkMobile('3450050667'), '923450050667');
});

// --- 3. Invalid input is refused, never glued into a link -------------------
console.log('3. Invalid numbers rejected');
for (const bad of ['', 'abc', '0345', '03001234567890', '93012345678', '0213456789']) {
  test(`"${bad}" -> '' (no link built)`, () => {
    assert.equal(normalizePkMobile(bad), '');
  });
}

// --- 4. wa.me link format ---------------------------------------------------
console.log('4. wa.me link format (Android / iOS / web universal)');
test('link carries digits + encoded text', () => {
  const link = waMeLink('923450050667', 'line one\nline two + special & chars');
  assert.equal(
    link,
    `https://wa.me/923450050667?text=${encodeURIComponent('line one\nline two + special & chars')}`,
  );
  assert.ok(link.startsWith('https://wa.me/923450050667?text='));
  assert.ok(!link.includes(' ')); // always URL-encoded, never raw spaces
});
test('configured numbers produce reachable links', () => {
  for (const contact of WHATSAPP_CONTACTS) {
    const intl = normalizePkMobile(contact.local);
    assert.ok(waMeLink(intl, 'hi').startsWith(`https://wa.me/${intl}?text=`));
  }
});

// --- 5. Message contents ----------------------------------------------------
console.log('5. Pre-filled order messages');
test('single item message has name, qty, price, restaurant', () => {
  const msg = buildSingleItemMessage({
    restaurantName: 'Kalam Valley Pizza Co.',
    itemName: 'Chapli Karahi',
    quantity: 2,
    itemPrice: 450,
  });
  assert.ok(msg.includes('Kalam Valley Pizza Co.'));
  assert.ok(msg.includes('Chapli Karahi'));
  assert.ok(msg.includes('2 x Chapli Karahi (Rs 450 each) = Rs 900'));
});
test('cart message has all items, subtotal, delivery fee and total', () => {
  const msg = buildCartMessage({
    restaurantName: 'Swat Grill House',
    items: [
      { name: 'Beef Burger', quantity: 2, unitPrice: 350 },
      { name: 'Trout Fish', quantity: 1, unitPrice: 1200 },
    ],
    subtotal: 1900,
    deliveryFee: 100,
    total: 2000,
  });
  assert.ok(msg.includes('Swat Grill House'));
  assert.ok(msg.includes('2 x Beef Burger (Rs 350 each) = Rs 700'));
  assert.ok(msg.includes('1 x Trout Fish = Rs 1,200'));
  assert.ok(msg.includes('Items total: Rs 1,900'));
  assert.ok(msg.includes('Delivery fee: Rs 100'));
  assert.ok(msg.includes('Order total: Rs 2,000'));
});
test('free delivery is shown as FREE, not Rs 0', () => {
  const msg = buildCartMessage({
    restaurantName: 'X',
    items: [{ name: 'Y', quantity: 1, unitPrice: 500 }],
    subtotal: 500,
    deliveryFee: 0,
    total: 500,
  });
  assert.ok(msg.includes('Delivery fee: FREE'));
});
test('follow-up message has status, total and restaurant', () => {
  const msg = buildOrderFollowUpMessage({
    restaurantName: 'Trout Point Cafe',
    items: [{ name: 'Kabuli Pulao', quantity: 1, unitPrice: 899 }],
    total: 999,
    statusLabel: 'On the way',
    placedAt: new Date('2026-10-26T12:00:00'),
  });
  assert.ok(msg.includes('Trout Point Cafe'));
  assert.ok(msg.includes('Order total: Rs 999'));
  assert.ok(msg.includes('Current status: On the way'));
  assert.ok(msg.includes('Placed at: 10/26/2026'));
});
test('browse message carries the kitchen name', () => {
  assert.ok(buildBrowseMessage('Dastarkhwan Biryani').includes('Dastarkhwan Biryani'));
});

console.log(`\nAll ${passed} WhatsApp link tests passed.`);
