import type { RiderApproval, RiderStatus } from '../models/RiderProfile';
import { RiderProfileModel } from '../models';

/**
 * Single owner of live rider location state.
 *
 * Both transports feed this module so the throttle/persist rules exist once:
 *   - Socket.IO `rider:location` (primary, see sockets/index.ts)
 *   - POST /rider/location (fallback when the socket is not connected)
 *
 * Writes are cached in memory and flushed to Supabase on an interval so a rider
 * moving at walking pace does not produce one UPDATE per GPS fix. `lastLocation`
 * on the RiderProfile document is the "latest known" position that admin and the
 * assigned customer read.
 */

type CachedLocation = {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  updatedAt: number;
  dirty: boolean;
};

export type RiderLocationInput = {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
};

const cache = new Map<string, CachedLocation>();

const FLUSH_INTERVAL_MS = 10_000;

/**
 * Location tracking is a rider-work state, not a privacy setting:
 * it only runs while the rider is approved AND working (Online or On Delivery).
 * Going Offline, finishing every delivery, or logging out stops updates, and
 * `clearRiderLocation` drops the cached fix so no stale position lingers.
 */
export function isRiderLocationTrackable(
  status: RiderStatus | undefined,
  approvalStatus: RiderApproval | undefined,
): boolean {
  if (approvalStatus !== 'approved') return false;
  return status === 'online' || status === 'busy';
}

export function recordRiderLocation(userId: string, input: RiderLocationInput): void {
  cache.set(userId, {
    lat: input.latitude,
    lng: input.longitude,
    heading: typeof input.heading === 'number' ? input.heading : 0,
    speed: typeof input.speed === 'number' ? Math.max(0, input.speed) : 0,
    updatedAt: Date.now(),
    dirty: true,
  });
}

/** Forget the buffered fix. Used when a rider stops working. */
export function clearRiderLocation(userId: string): void {
  cache.delete(userId);
}

export async function flushRiderLocation(userId: string): Promise<void> {
  const loc = cache.get(userId);
  if (!loc || !loc.dirty) return;
  loc.dirty = false;
  try {
    await RiderProfileModel.updateOne(
      { user: userId },
      {
        $set: {
          lastLocation: {
            lat: loc.lat,
            lng: loc.lng,
            heading: loc.heading,
            speed: loc.speed,
            updatedAt: new Date(loc.updatedAt),
          },
        },
      },
    );
  } catch (error) {
    loc.dirty = true; // retry on the next tick instead of losing the fix
    // eslint-disable-next-line no-console
    console.error(`[riderLocation] failed persisting for ${userId}:`, (error as Error).message);
  }
}

async function flushAllRiderLocations(): Promise<void> {
  await Promise.all([...cache.keys()].map((id) => flushRiderLocation(id)));
}

let interval: NodeJS.Timeout | null = null;

/** Idempotent; safe to call from both the socket bootstrap and a REST route. */
export function startRiderLocationFlusher(): void {
  if (interval) return;
  interval = setInterval(() => {
    void flushAllRiderLocations();
  }, FLUSH_INTERVAL_MS);
  interval.unref();
}
