import type { Address } from '../types/domain';

/**
 * Module-level scratch state for the ride booking flow (pickup/dropoff
 * chosen on the LocationPicker screen and consumed by RideBooking).
 *
 * The mutation lives inside this module (behind setter methods) so component
 * code never assigns to module state directly, which React Compiler lint
 * rules correctly flag as unsafe.
 */
const state: { pickup: Address | null; dropoff: Address | null } = {
  pickup: null,
  dropoff: null,
};

export const rideLocationStore = {
  get pickup(): Address | null {
    return state.pickup;
  },
  get dropoff(): Address | null {
    return state.dropoff;
  },
  setPickup(address: Address | null): void {
    state.pickup = address;
  },
  setDropoff(address: Address | null): void {
    state.dropoff = address;
  },
  /** Clears both stops once they have been turned into a real ride. */
  clear(): void {
    state.pickup = null;
    state.dropoff = null;
  },
};
