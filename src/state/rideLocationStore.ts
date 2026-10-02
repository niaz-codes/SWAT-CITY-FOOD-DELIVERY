import type { Address } from '../types/domain';

export const rideLocationStore: {
  pickup: Address | null;
  dropoff: Address | null;
} = {
  pickup: null,
  dropoff: null,
};