import type { Response } from 'express';
import { RideModel } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';
import { AppError, NOT_FOUND, UNAUTHORIZED } from '../utils/AppError';
import {
  acceptRide,
  advanceRide,
  cancelRide,
  computeFare,
  requestRide,
} from '../services/ride.service';

export const estimateRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body as {
    type: 'swat_moto' | 'swat_city' | 'swat_van';
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  };
  const { haversineKm } = await import('../utils/tokens');
  const distanceKm = haversineKm(
    { lat: pickupLat, lng: pickupLng },
    { lat: dropoffLat, lng: dropoffLng },
  );
  sendSuccess(res, computeFare(type, distanceKm));
});

export const createRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ride = await requestRide({
    customerId: req.user._id,
    type: req.body.type,
    pickup: req.body.pickup,
    dropoff: req.body.dropoff,
    paymentMethod: req.body.paymentMethod ?? 'cash',
  });
  sendSuccess(res, { ride });
});

export const myRides = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status, page = '1', limit = '20' } = req.query;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));
  const query: Record<string, unknown> = { customer: req.user._id, deletedAt: null };
  if (status) query.status = status;
  const [rides, total] = await Promise.all([
    RideModel.find(query).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    RideModel.countDocuments(query),
  ]);
  sendSuccess(res, { rides }, { page: p, limit: l, total });
});

export const rideDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ride = await RideModel.findById(req.params.id).populate('rider', 'name phone avatarUrl').lean();
  if (!ride) throw NOT_FOUND('Ride');
  if (String(ride.customer) !== req.user._id && String(ride.rider) !== req.user._id) {
    throw new AppError('You can only access rides you are part of', 403);
  }
  sendSuccess(res, { ride });
});

export const cancelRideCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ride = await cancelRide({
    rideId: req.params.id,
    actorId: req.user._id,
    by: 'customer',
    reason: req.body.reason,
  });
  sendSuccess(res, { ride });
});

/** Rider-only: accept a ride request broadcast on ride:request. */
export const acceptRideCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ride = await acceptRide(req.body.rideId, req.user._id);
  sendSuccess(res, { ride });
});

/** Rider-only: advance a ride: arriving → started → completed. */
export const advanceRideCtrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const { status } = req.body as { status: 'arriving' | 'started' | 'completed' };
  const ride = await RideModel.findById(req.params.id);
  if (!ride) throw NOT_FOUND('Ride');
  if (!ride.rider || String(ride.rider) !== req.user._id) {
    throw new AppError('Only the assigned rider can update this ride', 403);
  }
  const updated = await advanceRide(req.params.id, status, req.user._id);
  sendSuccess(res, { ride: updated });
});

export const riderCancelRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw UNAUTHORIZED();
  const ride = await RideModel.findById(req.params.id);
  if (!ride) throw NOT_FOUND('Ride');
  if (!ride.rider || String(ride.rider) !== req.user._id) {
    throw new AppError('Only the assigned rider can cancel this ride', 403);
  }
  const updated = await cancelRide({
    rideId: req.params.id,
    actorId: req.user._id,
    by: 'rider',
    reason: req.body.reason,
  });
  sendSuccess(res, { ride: updated });
});