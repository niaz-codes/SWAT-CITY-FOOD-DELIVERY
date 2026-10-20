// ============================================================
// Swat City Backend - Rider vehicle & base-location changes
//
// Riders update their own vehicle details and base location from the app.
// Two rules live here so no controller can forget them:
//
//   1. Ownership. A write is always scoped to the caller's own profile id —
//      there is no id in the request, so a rider can never touch another
//      rider's record.
//   2. Vehicle details are admin-confirmed. A rider may *propose* a vehicle
//      type / brand / plate, but the live `vehicle*` fields (which dispatch and
//      the admin map read) only change once an admin approves. That is why the
//      proposal is parked in `pendingVehicle` instead of being written directly.
//
// A plate is unique across riders: two riders cannot be tied to the same bike.
// ============================================================

import { RiderProfileModel, UserModel } from '../models';
import { AppError, CONFLICT, FORBIDDEN, NOT_FOUND } from '../utils/AppError';
import { notifyUser } from './notification.service';
import { assertRiderApproved } from './riderApproval.service';

export type VehicleType = 'bike' | 'rickshaw' | 'van' | 'car';

export interface VehicleChangeInput {
  vehicleType?: VehicleType;
  vehicleBrand?: string;
  vehiclePlate?: string;
}

export interface VehicleChangeResult {
  /** True when the change needs an admin decision before it takes effect. */
  pending: boolean;
  profile: unknown;
}

/**
 * Normalise a plate for comparison: uppercase, strip spaces/hyphens. "swat-1234"
 * and "SWAT 1234" are the same bike and must not slip past the unique check.
 */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Refuse a plate already attached to another rider.
 *
 * Checked against both the live plate and any plate another rider has pending,
 * so two riders cannot propose the same bike while both wait on approval.
 */
async function assertPlateAvailable(plate: string, riderProfileId: string): Promise<void> {
  const target = normalizePlate(plate);
  if (!target) return;

  const others = await RiderProfileModel.find({ _id: { $ne: riderProfileId } })
    .select('vehiclePlate pendingVehicle')
    .lean();

  for (const other of others) {
    const live = other.vehiclePlate ? normalizePlate(other.vehiclePlate) : '';
    const pending = other.pendingVehicle?.vehiclePlate
      ? normalizePlate(other.pendingVehicle.vehiclePlate)
      : '';
    if (live === target || pending === target) {
      throw CONFLICT('This registration number is already used by another rider');
    }
  }
}

/**
 * Apply a rider's vehicle change.
 *
 * Returns `pending: true` when the values differ from what is currently
 * approved and were parked for review, or `pending: false` when the change
 * matched the approved values (which simply clears a queued proposal).
 */
export async function requestVehicleChange(
  userId: string,
  input: VehicleChangeInput,
): Promise<VehicleChangeResult> {
  await assertRiderApproved(userId);

  const profile = await RiderProfileModel.findOne({ user: userId });
  if (!profile) throw NOT_FOUND('Rider profile');

  const nextType = input.vehicleType ?? (profile.vehicleType as VehicleType);
  const nextBrand =
    input.vehicleBrand !== undefined ? input.vehicleBrand.trim() : (profile.vehicleBrand ?? '');
  const nextPlate =
    input.vehiclePlate !== undefined
      ? input.vehiclePlate.trim().toUpperCase()
      : (profile.vehiclePlate ?? '');

  if (input.vehiclePlate !== undefined) {
    await assertPlateAvailable(nextPlate, String(profile._id));
  }

  const unchanged =
    nextType === profile.vehicleType &&
    nextBrand === (profile.vehicleBrand ?? '') &&
    nextPlate === (profile.vehiclePlate ?? '');

  if (unchanged) {
    // The rider reverted to their approved details: drop any queued proposal
    // rather than leaving a stale change sitting in the approval queue.
    if (profile.pendingVehicle?.requestedAt) {
      await RiderProfileModel.updateOne(
        { _id: profile._id },
        {
          $set: {
            pendingVehicle: {
              vehicleType: null,
              vehicleBrand: null,
              vehiclePlate: null,
              requestedAt: null,
              note: null,
            },
          },
        },
      );
    }
    const fresh = await RiderProfileModel.findById(profile._id).lean();
    return { pending: false, profile: fresh };
  }

  const note = describeChange(
    { vehicleType: profile.vehicleType, vehicleBrand: profile.vehicleBrand, vehiclePlate: profile.vehiclePlate },
    { vehicleType: nextType, vehicleBrand: nextBrand, vehiclePlate: nextPlate },
  );

  await RiderProfileModel.updateOne(
    { _id: profile._id },
    {
      $set: {
        pendingVehicle: {
          vehicleType: nextType,
          vehicleBrand: nextBrand || null,
          vehiclePlate: nextPlate || null,
          requestedAt: new Date(),
          note,
        },
      },
    },
  );

  await notifyAdmins(
    'Vehicle change awaiting review',
    `${profile.name} requested a vehicle update: ${note}`,
  );

  const fresh = await RiderProfileModel.findById(profile._id).lean();
  return { pending: true, profile: fresh };
}

/**
 * Tell every active admin a rider is waiting on a vehicle decision. Best-effort:
 * a failed notification must never fail the rider's request.
 */
async function notifyAdmins(title: string, body: string): Promise<void> {
  try {
    const admins = await UserModel.find({ role: 'admin', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    await Promise.all(
      admins.map((admin) =>
        notifyUser(String(admin._id), { type: 'system', title, body }).catch(() => undefined),
      ),
    );
  } catch {
    // Swallow: the pending change is already persisted and visible to admins.
  }
}

/** Human-readable summary of what changed, shown to riders and admins. */
function describeChange(
  before: { vehicleType?: string | null; vehicleBrand?: string | null; vehiclePlate?: string | null },
  after: { vehicleType?: string | null; vehicleBrand?: string | null; vehiclePlate?: string | null },
): string {
  const parts: string[] = [];
  if (after.vehicleType && after.vehicleType !== before.vehicleType) {
    parts.push(`${before.vehicleType ?? 'none'} → ${after.vehicleType}`);
  }
  if (after.vehiclePlate && after.vehiclePlate !== (before.vehiclePlate ?? '')) {
    parts.push(`plate ${before.vehiclePlate ?? 'none'} → ${after.vehiclePlate}`);
  }
  if ((after.vehicleBrand ?? '') !== (before.vehicleBrand ?? '')) {
    parts.push(`brand ${before.vehicleBrand ?? 'none'} → ${after.vehicleBrand || 'none'}`);
  }
  return parts.join(', ') || 'No change';
}

/**
 * Save the rider's chosen base location (the pin they drop on the map).
 *
 * Scoped to the caller's own profile, so a rider can only ever move their own
 * base. Independent of approval status: picking a base is part of setting up a
 * profile and is not a privileged action.
 */
export async function setRiderBaseLocation(
  userId: string,
  input: { lat: number; lng: number; label?: string },
): Promise<unknown> {
  const profile = await RiderProfileModel.findOne({ user: userId }).select('_id');
  if (!profile) throw NOT_FOUND('Rider profile');

  await RiderProfileModel.updateOne(
    { _id: profile._id },
    {
      $set: {
        baseLocation: {
          lat: input.lat,
          lng: input.lng,
          label: input.label?.trim() || null,
          setAt: new Date(),
        },
      },
    },
  );

  return RiderProfileModel.findById(profile._id).lean();
}

/** Guard used by the controller: a suspended rider may not change vehicles. */
export async function assertNotSuspended(userId: string): Promise<void> {
  const profile = await RiderProfileModel.findOne({ user: userId }).select('suspendedAt').lean();
  if (profile?.suspendedAt) {
    throw FORBIDDEN('Your account is suspended. Contact support.');
  }
}

export function invalidVehicle(message: string): AppError {
  return new AppError(message, 422);
}
