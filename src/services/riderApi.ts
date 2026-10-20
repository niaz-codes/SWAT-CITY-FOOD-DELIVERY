import { httpGet, httpPatch, httpPost, httpUpload } from './client';
import type { RiderProfile } from '../types/domain';

export type RiderProfileResponse = {
  profile: RiderProfile;
  user: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    verified?: boolean;
    status?: string;
  };
};

export type RiderDocument = {
  _id: string;
  type: string;
  url: string;
  status: string;
  createdAt: string;
};

export const riderApi = {
  /** Rider profile + approval state. CNIC comes back masked. */
  getProfile: () => httpGet<RiderProfileResponse>('/rider/profile').then((r) => r.data),

  updateProfile: (
    patch: Partial<
      Pick<RiderProfile, 'name' | 'phone' | 'vehicleType' | 'vehicleBrand' | 'vehiclePlate'>
    >,
  ) => httpPatch<{ profile: RiderProfile }>('/rider/profile', patch).then((r) => r.data),

  /**
   * Propose a vehicle change (type / brand / plate).
   *
   * The server validates the plate (format + uniqueness) and parks the change
   * for admin approval, because the live vehicle fields drive dispatch. The
   * response says whether it is `pending` admin review.
   */
  requestVehicleChange: (patch: {
    vehicleType?: string;
    vehicleBrand?: string;
    vehiclePlate?: string;
  }) =>
    httpPost<{ profile: RiderProfile; pending: boolean }>('/rider/vehicle', patch).then(
      (r) => r.data,
    ),

  /** Save the base location pin the rider dropped on the map. */
  setBaseLocation: (fix: { lat: number; lng: number; label?: string }) =>
    httpPost<{ profile: RiderProfile }>('/rider/base-location', fix).then((r) => r.data),

  setOnline: (online: boolean) =>
    httpPost<{ profile: RiderProfile }>('/rider/online-status', { online }).then((r) => r.data),

  /** Fallback location transport when the socket is unavailable. */
  sendLocation: (fix: { latitude: number; longitude: number; heading?: number; speed?: number }) =>
    httpPost<{ ok: boolean }>('/rider/location', fix).then((r) => r.data),

  documents: () =>
    httpGet<{ documents: RiderDocument[] }>('/rider/documents').then((r) => r.data.documents),

  /**
   * Upload an identity document. The image picker supplies the local URI, which
   * FormData uploads by name without a manual readAsString step.
   */
  uploadDocument: (localUri: string, type: string, fileName = 'document.jpg') => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', { uri: localUri, name: fileName, type: 'image/jpeg' } as unknown as Blob);
    return httpUpload<{ document: RiderDocument }>('/rider/documents', form).then((r) => r.data);
  },
};
