import { Types } from 'mongoose';
import {
  RideModel,
  type Ride,
  type RideStatus,
  type RideType,
} from '../models';
import { notifyUser } from './notification.service';
import { creditWallet, debitWallet } from './wallet.service';
import { getIO, SOCKET_EVENTS } from '../sockets';
import { AppError, CONFLICT, NOT_FOUND } from '../utils/AppError';
import { haversineKm, humanId } from '../utils/tokens';

export const FARE_TABLE: Record<RideType, { base: number; perKm: number; vehicle: 'bike' | 'rickshaw' | 'van' }> = {
  swat_moto: { base: 60, perKm: 22, vehicle: 'bike' },
  swat_city: { base: 90, perKm: 28, vehicle: 'rickshaw' },
  swat_van: { base: 140, perKm: 36, vehicle: 'van' },
};

const RIDER_PAYOUT_RATE = 0.76;

export interface FareEstimate {
  type: RideType;
  vehicle: 'bike' | 'rickshaw' | 'van';
  distanceKm: number;
  durationMin: number;
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  fare: number;
}

export function computeFare(type: RideType, distanceKm: number, surge = 1): FareEstimate {
  const t = FARE_TABLE[type];
  const distanceFare = t.perKm * distanceKm;
  const fare = Math.round((t.base + distanceFare) * surge / 10) * 10;
  return {
    type,
    vehicle: t.vehicle,
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMin: Math.round((distanceKm / 25) * 60),
    baseFare: t.base,
    distanceFare: Math.round(distanceFare),
    surgeMultiplier: surge,
    fare: Math.max(t.base, fare),
  };
}

export const RIDE_FLOW: Record<RideStatus, RideStatus[]> = {
  searching: ['accepted', 'cancelled'],
  accepted: ['arriving', 'cancelled'],
  arriving: ['started', 'cancelled'],
  started: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canRideTransition(from: RideStatus, to: RideStatus): boolean {
  return RIDE_FLOW[from]?.includes(to) ?? false;
}

/**
 * requestRide — customer creates a ride (fare computed server-side),
 * broadcasts ride:request to all online approved riders.
 */
export async function requestRide(input: {
  customerId: string;
  type: RideType;
  pickup: { address: string; area?: string; lat: number; lng: number };
  dropoff: { address: string; area?: string; lat: number; lng: number };
  paymentMethod: 'cash' | 'wallet';
}): Promise<Ride> {
  const distanceKm = haversineKm(
    { lat: input.pickup.lat, lng: input.pickup.lng },
    { lat: input.dropoff.lat, lng: input.dropoff.lng },
  );
  const estimate = computeFare(input.type, distanceKm);

  const ride = await RideModel.create({
    customer: input.customerId,
    type: input.type,
    vehicle: estimate.vehicle,
    status: 'searching',
    statusHistory: [{ status: 'searching', note: 'Looking for a rider' }],
    pickup: input.pickup,
    dropoff: input.dropoff,
    distanceKm: estimate.distanceKm,
    durationMin: estimate.durationMin,
    baseFare: estimate.baseFare,
    distanceFare: estimate.distanceFare,
    surgeMultiplier: estimate.surgeMultiplier,
    fare: estimate.fare,
    riderPayout: Math.round(estimate.fare * RIDER_PAYOUT_RATE),
    paymentMethod: input.paymentMethod,
  });
  ride.rideNumber = humanId('RIDE', String(ride._id));
  await ride.save();

  const io = getIO();
  io.emit(SOCKET_EVENTS.rideRequest, {
    rideId: String(ride._id),
    rideNumber: ride.rideNumber,
    type: ride.type,
    pickup: ride.pickup,
    dropoff: ride.dropoff,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    fare: ride.fare,
    customerId: input.customerId,
    createdAt: new Date().toISOString(),
  });

  await notifyUser(input.customerId, {
    type: 'ride',
    event: 'ride_requested',
    refId: String(ride._id),
    title: 'Ride requested',
    body: `Looking for a ${FARE_TABLE[input.type].vehicle} near ${input.pickup.address}.`,
    data: { rideId: String(ride._id), rideNumber: ride.rideNumber },
  });

  return ride;
}

export async function acceptRide(rideId: string, riderUserId: string): Promise<Ride> {
  const ride = await RideModel.findById(rideId);
  if (!ride) throw NOT_FOUND('Ride');
  if (ride.status !== 'searching') throw CONFLICT('Ride is no longer available');
  if (ride.rider) throw CONFLICT('Ride already has a rider');

  ride.rider = new Types.ObjectId(riderUserId);
  ride.status = 'accepted';
  ride.statusHistory.push({ status: 'accepted', note: `Rider ${riderUserId} accepted` });
  await ride.save();

  const io = getIO();
  io.emit(SOCKET_EVENTS.rideAccepted, {
    rideId: String(ride._id),
    rideNumber: ride.rideNumber,
    riderId: riderUserId,
    status: ride.status,
  });

  await notifyUser(String(ride.customer), {
    type: 'ride',
    event: 'ride_accepted',
    refId: String(ride._id),
    title: 'Rider accepted your ride',
    body: `Your ${ride.vehicle} is on the way to ${ride.pickup?.address ?? 'your pickup point'}.`,
    data: { rideId: String(ride._id), rideNumber: ride.rideNumber, status: ride.status },
  });

  return ride;
}

export async function advanceRide(rideId: string, to: RideStatus, actorId: string): Promise<Ride> {
  const ride = await RideModel.findById(rideId);
  if (!ride) throw NOT_FOUND('Ride');
  if (!canRideTransition(ride.status, to)) throw CONFLICT(`Cannot move ride from '${ride.status}' to '${to}'`);

  ride.status = to;
  ride.statusHistory.push({ status: to, note: `Updated to ${to}` });
  await ride.save();

  const io = getIO();
  io.emit(SOCKET_EVENTS.rideStatus, {
    rideId: String(ride._id),
    rideNumber: ride.rideNumber,
    status: to,
    timestamp: new Date().toISOString(),
  });

  // `arriving` is the "rider has reached the pickup point" state.
  if (to === 'arriving') {
    const pickup = ride.pickup?.address ?? 'the pickup point';
    await notifyUser(String(ride.customer), {
      type: 'ride',
      event: 'ride_arrived',
      refId: String(ride._id),
      title: 'Your rider has arrived',
      body: `Your ${ride.vehicle} is waiting at ${pickup}.`,
      data: { rideId: String(ride._id), rideNumber: ride.rideNumber, status: to },
    });
  }

  if (to === 'completed') {
    // Rider payout
    if (ride.riderPayout > 0) {
      await creditWallet(String(ride.rider), ride.riderPayout, 'earning', {
        reference: 'ride',
        referenceModel: 'Ride',
        description: `Earnings for ride ${ride.rideNumber}`,
        byUser: actorId,
      });
    }
    // Collect fare from customer wallet if chosen
    if (ride.paymentMethod === 'wallet' && ride.fare > 0) {
      await debitWallet(String(ride.customer), ride.fare, 'debit', {
        reference: 'ride',
        referenceModel: 'Ride',
        description: `Fare for ride ${ride.rideNumber}`,
        byUser: actorId,
      });
    }
    await notifyUser(String(ride.customer), {
      type: 'ride',
      event: 'ride_completed',
      refId: String(ride._id),
      title: 'Ride completed',
      body: `Your ride to ${ride.dropoff?.address ?? 'destination'} is complete. Total: Rs ${ride.fare}.`,
      data: { rideId: String(ride._id), rideNumber: ride.rideNumber, status: 'completed' },
    });
  }

  return ride;
}

export async function cancelRide(input: {
  rideId: string;
  actorId: string;
  by: 'customer' | 'rider' | 'admin' | 'system';
  reason: string;
}): Promise<Ride> {
  const ride = await RideModel.findById(input.rideId);
  if (!ride) throw NOT_FOUND('Ride');
  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw CONFLICT(`Ride is already ${ride.status}`);
  }
  ride.status = 'cancelled';
  ride.statusHistory.push({ status: 'cancelled', note: `Cancelled by ${input.by}: ${input.reason}` });
  ride.cancelReason = input.reason;
  ride.cancelledBy = input.by;
  await ride.save();

  await notifyUser(String(ride.customer), {
    type: 'ride',
    event: 'ride_cancelled',
    refId: String(ride._id),
    title: 'Ride cancelled',
    body: input.reason,
    data: { rideId: String(ride._id), rideNumber: ride.rideNumber, status: 'cancelled' },
  });

  if (ride.rider) {
    await notifyUser(String(ride.rider), {
      type: 'ride',
      event: 'ride_cancelled',
      refId: String(ride._id),
      title: 'Ride cancelled',
      body: `Ride ${ride.rideNumber} was cancelled: ${input.reason}`,
      data: { rideId: String(ride._id), rideNumber: ride.rideNumber, status: 'cancelled' },
    });
  }

  return ride;
}