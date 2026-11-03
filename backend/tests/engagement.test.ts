import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOYALTY_DEFAULTS,
  pointsDiscountFor,
  pointsEarnable,
  scheduledForError,
} from '../src/services/loyalty.service';
import { chatOpenForStatus, describeChatAccess } from '../src/services/chat.service';
import { CODE_LENGTH, generateReferralCode } from '../src/services/referral.service';

/**
 * Engagement suite pure logic: loyalty maths, scheduled-order window policy,
 * per-order chat participation rules, referral code shape. Database access is
 * exercised in production; these tests pin the business rules themselves.
 */

describe('loyalty maths', () => {
  const config = { earnRate: 5, pointValue: 1, maxPercent: 30 };

  it('earns floored points per Rs 100 of subtotal', () => {
    assert.equal(pointsEarnable(100, 5), 5);
    assert.equal(pointsEarnable(450, 5), 22); // 4.5 × 5 → floored
    assert.equal(pointsEarnable(99, 5), 4);
    assert.equal(pointsEarnable(0, 5), 0);
    assert.equal(pointsEarnable(-50, 5), 0);
  });

  it('redeems exactly the requested points when the subtotal is huge', () => {
    const { points, discount } = pointsDiscountFor(120, 10_000, config);
    assert.equal(points, 120);
    assert.equal(discount, 120);
  });

  it('caps the redemption by the max-percent rule', () => {
    // 30% of a Rs 500 subtotal is Rs 150 → 150 points at Rs 1 each.
    const { points, discount } = pointsDiscountFor(10_000, 500, config);
    assert.equal(points, 150);
    assert.equal(discount, 150);
  });

  it('caps the redemption so a discount never equals the subtotal', () => {
    const { points } = pointsDiscountFor(10_000, 100, { ...config, maxPercent: 60 });
    assert.ok(points < 100);
    assert.ok(Number.isInteger(points));
  });

  it('never goes negative and treats junk input as zero', () => {
    assert.deepEqual(pointsDiscountFor(-5, 500, config), { points: 0, discount: 0 });
    assert.deepEqual(pointsDiscountFor(Number.NaN, 500, config), { points: 0, discount: 0 });
    assert.deepEqual(pointsDiscountFor(50, 0, config), { points: 0, discount: 0 });
  });

  it('keeps the platform defaults within sane bounds', () => {
    assert.equal(LOYALTY_DEFAULTS.earnRate, 5);
    assert.equal(LOYALTY_DEFAULTS.pointValue, 1);
    assert.equal(LOYALTY_DEFAULTS.maxPercent, 30);
  });
});

describe('scheduled order window', () => {
  const now = new Date('2026-05-10T10:00:00.000Z');

  it('accepts a slot 30 minutes ahead', () => {
    assert.equal(scheduledForError(new Date('2026-05-10T10:30:00.000Z'), now, { minLeadMinutes: 30 }), null);
  });

  it('rejects a slot inside the 30-minute lead', () => {
    const err = scheduledForError(new Date('2026-05-10T10:29:59.000Z'), now, { minLeadMinutes: 30, maxDays: 7 });
    assert.match(String(err ?? ''), /at least 30 minutes/);
  });

  it('rejects a slot beyond 7 days', () => {
    const err = scheduledForError(new Date('2026-05-18T10:00:00.000Z'), now, { minLeadMinutes: 30, maxDays: 7 });
    assert.match(String(err ?? ''), /7 days/);
  });

  it('accepts an absent or empty schedule (regular immediate order)', () => {
    assert.equal(scheduledForError(undefined, now), null);
    assert.equal(scheduledForError('', now), null);
  });

  it('rejects unparseable timestamps as lead violations, not crashes', () => {
    assert.notEqual(scheduledForError(new Date('not-a-date'), now), null);
  });
});

describe('per-order chat participation', () => {
  const base = {
    _id: 'order-1',
    customer: 'customer-1',
    restaurant: 'restaurant-1',
    status: 'preparing',
  };

  it('routes the customer to the assigned rider when there is one', () => {
    const access = describeChatAccess({ ...base, rider: 'rider-1' }, 'customer-1', 'owner-1');
    assert.deepEqual(access, {
      role: 'customer',
      counterpartId: 'rider-1',
      counterpartRole: 'rider',
    });
  });

  it('routes the customer to the restaurant owner before a rider exists', () => {
    const access = describeChatAccess(base as any, 'customer-1', 'owner-1' as any);
    assert.deepEqual(access, {
      role: 'customer',
      counterpartId: 'owner-1',
      counterpartRole: 'restaurant',
    });
  });

  it('always routes rider and restaurant to the customer', () => {
    assert.deepEqual(describeChatAccess({ ...base, rider: 'rider-1' } as any, 'rider-1', 'owner-1' as any), {
      role: 'rider',
      counterpartId: 'customer-1',
      counterpartRole: 'customer',
    });
    assert.deepEqual(describeChatAccess(base as any, 'owner-1' as any, 'owner-1' as any), {
      role: 'restaurant',
      counterpartId: 'customer-1',
      counterpartRole: 'customer',
    });
  });

  it('excludes everyone who is not part of the order', () => {
    assert.equal(describeChatAccess({ ...base, rider: 'rider-1' } as any, 'stranger', 'owner-1' as any), null);
    assert.equal(describeChatAccess(base as any, 'stranger', null as any), null);
  });

  it('keeps chat closed on cancelled orders only', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'ready', 'rider_assigned', 'on_the_way', 'delivered']) {
      assert.equal(chatOpenForStatus(status), true, status);
    }
    assert.equal(chatOpenForStatus('cancelled'), false);
  });
});

describe('referral codes', () => {
  it('draws share codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateReferralCode();
      assert.equal(code.length, CODE_LENGTH);
      assert.match(code, /^[A-HJ-NP-Z2-9]+$/, code);
      assert.ok(!/[IO01]/.test(code));
    }
  });

  it('draws different codes on different calls', () => {
    const seen = new Set(Array.from({ length: 12 }, () => generateReferralCode()));
    assert.ok(seen.size > 1);
  });
});
