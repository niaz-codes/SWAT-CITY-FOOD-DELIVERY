import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { LocationObject, LocationSubscription } from 'expo-location';
import { Platform } from 'react-native';
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

/** Android-only foreground-service task that keeps GPS alive for ACTIVE deliveries. */
export const DELIVERY_TASK_NAME = 'swat-city-rider-delivery';

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

// ---------------------------------------------------------------------------
// Android foreground service (active deliveries only)
//
// The requirements are: GPS keeps running in the background ONLY while the
// rider status is `busy` (a customer is watching the dot mid-delivery), and
// never otherwise. SDK 58 exposes that through `startLocationUpdatesAsync` +
// a TaskManager task; the watcher API no longer carries the foregroundService
// option. The task is defined in global scope (TaskManager requirement) and is
// idempotent, so riderLocation.ts being imported once at startup is enough.
// A task left registered after an app kill is reconsidered in the
// RiderLocationProvider effect on the next launch and stopped if the rider is
// no longer mid-delivery.
// ---------------------------------------------------------------------------

if (!TaskManager.isTaskDefined(DELIVERY_TASK_NAME)) {
  TaskManager.defineTask(DELIVERY_TASK_NAME, ({ data, error }): Promise<void> => {
    if (error) return Promise.resolve();
    const fix = extractFix(data);
    if (fix) void sendFix(fix);
    return Promise.resolve();
  });
}

function extractFix(data: unknown): PositionFix | null {
  const locations = (data as { locations?: LocationObject[] } | null)?.locations;
  const coords = locations?.[locations.length - 1]?.coords;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    return null;
  }
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    heading: coords.heading ?? 0,
    speed: coords.speed ?? 0,
  };
}

/** True once the OS-level registration exists (checked across app restarts). */
export async function isDeliveryTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(DELIVERY_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * Start the foreground-service task for an active delivery. Returns true when
 * the system accepted it; the caller falls back to the plain watcher when the
 * device or its permissions refuse (so tracking still works in the foreground).
 */
export async function startDeliveryTask(): Promise<boolean> {
  try {
    await Location.startLocationUpdatesAsync(DELIVERY_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 10,
      timeInterval: 5000,
      showsBackgroundLocationIndicator: true,
      // Android: the visible "Delivering your order" notification keeps the
      // process alive while the rider navigates elsewhere or locks the phone.
      ...(Platform.OS === 'android'
        ? {
            foregroundService: {
              notificationTitle: 'Delivering your order',
              notificationBody: 'Your location is being shared with the customer.',
              notificationColor: '#0E9488',
              killServiceOnDestroy: true,
            },
          }
        : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopDeliveryTask(): Promise<void> {
  try {
    await Location.stopLocationUpdatesAsync(DELIVERY_TASK_NAME);
  } catch {
    // Not registered / already stopped — nothing to clean up.
  }
}

/**
 * Start sharing the rider's position.
 *
 * `onFix` fires for every local sample so the rider's own map can follow along
 * without waiting for the server round-trip.
 *
 * `keepAliveInBackground` is set ONLY for `busy` riders (an active delivery):
 * it runs the GPS in an Android foreground service, so positions keep flowing
 * while the rider opens Google Maps or locks the phone — a customer
 * mid-delivery is watching that dot. Idle online riders get the plain
 * foreground watcher, which stops when the app backgrounds (as before).
 *
 * Returns the subscription when the foreground watcher was started, `null`
 * otherwise (permission denied, or the foreground-service task took over — in
 * which case `keepAliveInBackground` succeeded and no watcher is needed).
 */
export async function startLocationSharing(
  onFix?: (fix: PositionFix) => void,
  keepAliveInBackground = false,
): Promise<LocationSubscription | null> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') return null;

  if (keepAliveInBackground) {
    // The delivery task owns background persistence; when it accepts, NO
    // watcher is returned — the provider records task mode instead.
    if (Platform.OS === 'android' && (await startDeliveryTask())) return null;
  }

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
