/**
 * Home screen per role.
 *
 * The admin panel is deliberately NOT in this app: it is a separate web
 * application (admin-web), so an APK parcel never carries admin screens, admin
 * API code or admin role guards. Admins sign in on the web.
 */
import type { Role } from '../types/domain';

export type HomeRoute = 'Main' | 'RiderMain' | 'PartnerPortal';

export function userHome(role?: string): HomeRoute {
  if (role === 'rider') return 'RiderMain';
  if (role === 'restaurant') return 'PartnerPortal';
  return 'Main';
}

/** Roles that can sign in through this app at all. */
export function canSignInOnMobile(role?: Role | string): boolean {
  return role !== 'admin';
}
