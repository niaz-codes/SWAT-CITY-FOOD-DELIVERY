import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAssignRider } from '../src/utils/orderPolicy';

/**
 * Rider assignment gate.
 *
 * A rider self-accepting from the feed must only take an order the kitchen has
 * marked ready; previously pending and confirmed orders were accepted too,
 * which dispatched riders to food that did not exist yet.
 */
describe('rider assignment policy', () => {
  it('lets a rider self-accept only a ready order', () => {
    assert.equal(canAssignRider('ready'), true);
    assert.equal(canAssignRider('pending'), false);
    assert.equal(canAssignRider('confirmed'), false);
    assert.equal(canAssignRider('preparing'), false);
    assert.equal(canAssignRider('delivered'), false);
  });

  it('lets admin dispatch assign early when explicitly allowed', () => {
    assert.equal(canAssignRider('pending', true), true);
    assert.equal(canAssignRider('confirmed', true), true);
    assert.equal(canAssignRider('ready', true), true);
  });

  it('never assigns an order that is already on the road or finished', () => {
    for (const status of ['rider_assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] as const) {
      assert.equal(canAssignRider(status, true), false, status);
    }
  });
});
