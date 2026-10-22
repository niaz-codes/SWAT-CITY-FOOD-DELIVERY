import { defineModel } from '../db/model';
import { UserModel } from './User';

export const RIDE_TYPES = ['swat_moto', 'swat_city', 'swat_van'] as const;
export type RideType = (typeof RIDE_TYPES)[number];

export const RIDE_STATUSES = [
  'searching',
  'accepted',
  'arriving',
  'started',
  'completed',
  'cancelled',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

/** One entry of the ride's status timeline (no `_id`). */
export interface RideStatusEvent {
  status?: RideStatus | null;
  note?: string | null;
  at?: Date | null;
}

/** Pickup / dropoff pair — both required (address + coordinates). */
export interface RideStop {
  address: string;
  area?: string | null;
  lat: number;
  lng: number;
}

export interface Ride {
  _id: string;

  rideNumber?: string | null;

  customer: string;
  rider?: string | null;

  type: RideType;
  vehicle: string;

  status: RideStatus;
  statusHistory: RideStatusEvent[];

  pickup: RideStop;
  dropoff: RideStop;

  distanceKm: number;
  durationMin: number;

  // Fare computed server-side from base + perKm.
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  fare: number;
  riderPayout: number;

  paymentMethod: string;
  cancelReason?: string | null;
  cancelledBy?: string | null;

  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RideModel = defineModel<Ride>({
  table: 'rides',
  columns: [
    'rideNumber',
    'customer',
    'rider',
    'type',
    'vehicle',
    'status',
    'statusHistory',
    'pickup',
    'dropoff',
    'distanceKm',
    'durationMin',
    'baseFare',
    'distanceFare',
    'surgeMultiplier',
    'fare',
    'riderPayout',
    'paymentMethod',
    'cancelReason',
    'cancelledBy',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    customer: () => UserModel,
    rider: () => UserModel,
  },
});
