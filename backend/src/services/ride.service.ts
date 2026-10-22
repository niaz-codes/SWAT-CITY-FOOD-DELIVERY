import {
  RideModel,
  WalletTransactionModel,
  type Ride,
  type RideStatus,
  type RideType,
} from '../models';
import { notifyUser } from './notification.service';
import { creditWallet, debitWallet } from './wallet.service';
import { assertRiderApproved } from './riderApproval.service';
import { getIO, SOCKET_EVENTS } from '../sockets';
import { CONFLICT, NOT_FOUND } from '../utils/AppError';
import { haversineKm, humanId } from '../utils/tokens';

const FARE_TABLE: Record<
  RideType,
  { base: number; perKm: number; vehicle: 'bike' | 'rickshaw' | 'van' }
> = {
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
  const fare = Math.round(((t.base + distanceFare) * surge) / 10) * 10;
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

const RIDE_FLOW: Record<RideStatus, RideStatus[]> = {
  searching: ['accepted', 'cancelled'],
  accepted: ['arriving', 'cancelled'],
  arriving: ['started', 'cancelled'],
  started: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function canRideTransition(from: RideStatus, to: RideStatus): boolean {
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
  // Only an admin-approved rider may accept work.
  await assertRiderApproved(riderUserId);

  const ride = await RideModel.findById(rideId);
  if (!ride) throw NOT_FOUND('Ride');
  if (ride.status !== 'searching') throw CONFLICT('Ride is no longer available');
  if (ride.rider) throw CONFLICT('Ride already has a rider');

  ride.rider = riderUserId as any;
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
  const from = ride.status;
  if (!canRideTransition(from, to)) throw CONFLICT(`Cannot move ride from '${from}' to '${to}'`);

  // Compare-and-set: only one concurrent request can move the ride out of its
  // current status; the loser gets a conflict instead of re-running the
  // completion side effects (wallet payout + fare debit) a second time.
  const updated = await RideModel.findOneAndUpdate(
    { _id: rideId, status: from },
    { $set: { status: to } },
    { new: true },
  );
  if (!updated) throw CONFLICT('Ride status changed concurrently. Refresh and try again.');
  updated.statusHistory.push({ status: to, note: `Updated to ${to}` });
  await updated.save();

  const io = getIO();
  io.emit(SOCKET_EVENTS.rideStatus, {
    rideId: String(updated._id),
    rideNumber: updated.rideNumber,
    status: to,
    timestamp: new Date().toISOString(),
  });

  // `arriving` is the "rider has reached the pickup point" state.
  if (to === 'arriving') {
    const pickup = updated.pickup?.address ?? 'the pickup point';
    await notifyUser(String(updated.customer), {
      type: 'ride',
      event: 'ride_arrived',
      refId: String(updated._id),
      title: 'Your rider has arrived',
      body: `Your ${updated.vehicle} is waiting at ${pickup}.`,
      data: { rideId: String(updated._id), rideNumber: updated.rideNumber, status: to },
    });
  }

  if (to === 'completed') {
    // Ledger-level idempotency on both money legs: the descriptions name the
    // unique ride number, so a raced duplicate completion skips instead of
    // paying the rider twice or charging the customer twice.
    const earningDescription = `Earnings for ride ${updated.rideNumber}`;
    const alreadyEarned = await WalletTransactionModel.findOne({
      user: String(updated.rider),
      type: 'earning',
      description: earningDescription,
    });
    if (!alreadyEarned && updated.riderPayout > 0) {
      await creditWallet(String(updated.rider), updated.riderPayout, 'earning', {
        reference: 'ride',
        referenceModel: 'Ride',
        description: earningDescription,
        byUser: actorId,
      });
    }
    // Collect fare from customer wallet if chosen
    const fareDescription = `Fare for ride ${updated.rideNumber}`;
    const alreadyCharged = await WalletTransactionModel.findOne({
      user: String(updated.customer),
      description: fareDescription,
    });
    if (!alreadyCharged && updated.paymentMethod === 'wallet' && updated.fare > 0) {
      await debitWallet(String(updated.customer), updated.fare, 'debit', {
        reference: 'ride',
        referenceModel: 'Ride',
        description: fareDescription,
        byUser: actorId,
      });
    }
    await notifyUser(String(updated.customer), {
      type: 'ride',
      event: 'ride_completed',
      refId: String(updated._id),
      title: 'Ride completed',
      body: `Your ride to ${updated.dropoff?.address ?? 'destination'} is complete. Total: Rs ${updated.fare}.`,
      data: { rideId: String(updated._id), rideNumber: updated.rideNumber, status: 'completed' },
    });
  }

  return updated;
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
  ride.statusHistory.push({
    status: 'cancelled',
    note: `Cancelled by ${input.by}: ${input.reason}`,
  });
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
