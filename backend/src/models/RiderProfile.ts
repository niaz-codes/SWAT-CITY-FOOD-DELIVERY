import { defineModel, type ModelApi } from '../db/model';
import { UserModel } from './User';
import { RiderDocumentModel } from './RiderDocument';

export const RIDER_STATUSES = ['offline', 'online', 'busy'] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const RIDER_APPROVAL = ['pending', 'approved', 'rejected'] as const;
export type RiderApproval = (typeof RIDER_APPROVAL)[number];

/** Location data received via Socket.IO (latest known position). */
export interface RiderLocation {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  updatedAt: Date | null;
}

/** Where the rider picked their base on the live map at registration. */
export interface RiderBaseLocation {
  lat: number | null;
  lng: number | null;
  label: string | null;
  setAt: Date | null;
}

/**
 * A rider-proposed vehicle change awaiting admin approval.
 *
 * Everything is nullable and `requestedAt` is the marker that decides whether a
 * proposal exists: `null` means there is nothing pending. Only the fields the
 * rider actually changed are populated.
 */
export interface RiderPendingVehicle {
  vehicleType: string | null;
  vehicleBrand: string | null;
  vehiclePlate: string | null;
  requestedAt: Date | null;
  note: string | null;
}

export interface RiderProfile {
  _id: string;

  user: string;
  name: string;
  // Admin-approved profile photo. Riders can NEVER write this field; only the
  // admin photo endpoint sets it (see admin.controller.ts).
  avatarUrl?: string | null;
  // Cloudinary public id, kept so a replaced photo can delete its old asset.
  avatarPublicId?: string | null;
  avatarUpdatedBy?: string | null;
  avatarUpdatedAt: Date | null;

  // Self-taken photo submitted by the rider with their registration. This is
  // deliberately a separate field from `avatarUrl`: the rider's own camera
  // shot is an application attachment that an admin still has to approve,
  // so it must never silently become the public avatar. The rider may write
  // this field only through POST /auth/register/rider.
  photoUrl?: string | null;
  photoPublicId?: string | null;
  photoUploadedAt: Date | null;

  phone?: string | null;

  // CNIC is sensitive: set at registration, exposed only through admin-scoped
  // endpoints and the rider's own profile endpoint. Never selected into
  // customer-facing payloads.
  cnic?: string | null;
  cnicIssueDate: Date | null;
  // Location data received via Socket.IO is throttle-written here (latest known).
  lastLocation: RiderLocation;
  // Where the rider picked their base on the live map at registration. Unlike
  // `lastLocation` this never moves, so dispatch can show a rider's zone even
  // before they have ever gone online.
  baseLocation: RiderBaseLocation;
  // Stated years of riding experience, captured on the registration form.
  experienceYears: number | null;
  baseCity?: string | null;

  vehicleType: string;
  vehicleBrand?: string | null;
  // Bike / vehicle registration number. Admin-managed like the photo (the
  // rider can propose one at registration, admin confirms before approval).
  vehiclePlate?: string | null;
  vehiclePlateUpdatedBy?: string | null;

  // A rider's proposed change to their vehicle (type / brand / plate) that an
  // admin still has to sign off. Held separately from the live `vehicle*`
  // fields so a pending proposal can never take effect, or be used for
  // dispatch, until it is approved. Cleared on approval or rejection.
  pendingVehicle: RiderPendingVehicle;

  approvalStatus: RiderApproval;
  // Why admin rejected the rider. Cleared on (re)approval. Shown to the rider.
  rejectionReason: string | null;
  reviewedBy?: string | null;
  reviewedAt: Date | null;
  // 'offline' | 'online' | 'busy'. 'busy' is the "On Delivery" state: the
  // rider holds at least one accepted order/ride and is not taking new work.
  status: RiderStatus;
  isOnline: boolean;

  suspendedAt: Date | null;

  verificationId?: string | null;

  rating: number;
  totalTrips: number;

  createdAt: Date;
  updatedAt: Date;
}

export const RiderProfileModel: ModelApi<RiderProfile> = defineModel<RiderProfile>({
  table: 'rider_profiles',
  columns: [
    'user',
    'name',
    'avatarUrl',
    'avatarPublicId',
    'avatarUpdatedBy',
    'avatarUpdatedAt',
    'photoUrl',
    'photoPublicId',
    'photoUploadedAt',
    'phone',
    'cnic',
    'cnicIssueDate',
    'lastLocation',
    'baseLocation',
    'experienceYears',
    'baseCity',
    'vehicleType',
    'vehicleBrand',
    'vehiclePlate',
    'vehiclePlateUpdatedBy',
    'pendingVehicle',
    'approvalStatus',
    'rejectionReason',
    'reviewedBy',
    'reviewedAt',
    'status',
    'isOnline',
    'suspendedAt',
    'verificationId',
    'rating',
    'totalTrips',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
    avatarUpdatedBy: () => UserModel,
    vehiclePlateUpdatedBy: () => UserModel,
    reviewedBy: () => UserModel,
    verificationId: () => RiderDocumentModel,
  },
});
