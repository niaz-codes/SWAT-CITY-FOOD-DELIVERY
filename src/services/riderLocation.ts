import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import { getSocket } from './socket';
import { httpPost } from './client';

export type RiderStatus = 'offline' | 'online' | 'busy';

export type PositionFix = {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
};

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

/**
 * Live sharing is allowed only for these states. A rejected, pending, approved
 * but Offline rider never broadcasts a position.
 */
export function shouldShareLocation(status?: RiderStatus | string | null): boolean {
  return status === 'online' || status === 'busy';
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function getCurrentFix(): Promise<PositionFix | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading ?? 0,
      speed: position.coords.speed ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Pushes one fix to the server.
 *
 * The socket is preferred because it is already authenticated and cheap. The
 * REST call is the fallback so a rider who is on a flaky mobile network, or
 * whose socket handshake failed, still records a position rather than going
 * dark on the customer's map.
 */
export async function sendFix(fix: PositionFix): Promise<boolean> {
  const active = await getSocket();
  if (active?.connected) {
    active.emit('rider:location', fix);
    return true;
  }
  try {
    await httpPost('/rider/location', fix);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start sharing the rider's position.
 *
 * `onFix` fires for every local sample so the rider's own map can follow along
 * without waiting for the server round-trip.
 */
export async function startLocationSharing(
  onFix?: (fix: PositionFix) => void,
): Promise<LocationSubscription | null> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') return null;

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 10,
      timeInterval: 5000,
    },
    (position) => {
      const fix: PositionFix = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading ?? 0,
        speed: position.coords.speed ?? 0,
      };
      onFix?.(fix);
      void sendFix(fix);
    },
  );
}

export function stopLocationSharing(subscription: LocationSubscription | null): void {
  try {
    subscription?.remove();
  } catch {
    // Already removed - nothing to clean up.
  }
}
