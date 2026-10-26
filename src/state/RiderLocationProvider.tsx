import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { LocationSubscription } from 'expo-location';
import {
  shouldShareLocation,
  startLocationSharing,
  stopLocationSharing,
} from '../services/riderLocation';
import { closeSocket, getSocket } from '../services/socket';
import { riderApi } from '../services/riderApi';
import { useAuth } from './AuthContext';
import type { RiderProfile } from '../types/domain';

type RiderLocationState = {
  /** True while the OS watcher is running and fixes are being uploaded. */
  sharing: boolean;
  permissionDenied: boolean;
  profile: RiderProfile | null;
  refreshProfile: () => Promise<void>;
};

const initialState: RiderLocationState = {
  sharing: false,
  permissionDenied: false,
  profile: null,
  refreshProfile: async () => undefined,
};

const RiderLocationContext = createContext<RiderLocationState>(initialState);

/** Reads the server profile; returns null on any failure (never throws). */
async function fetchRiderProfile(): Promise<RiderProfile | null> {
  try {
    const data = await riderApi.getProfile();
    return data.profile;
  } catch {
    // A failed profile read must not start sharing; leaving the profile null
    // keeps the watcher off until a later refresh succeeds.
    return null;
  }
}

/**
 * Owns the rider's live-location lifecycle for the whole app.
 *
 * Sharing is deliberately centralised here instead of inside a screen: the
 * requirement is that a location is broadcast while the rider is online or on
 * a delivery and never otherwise, which has to hold regardless of which screen
 * is open. The watcher therefore starts and stops purely from the server
 * profile state, and is torn down on logout or a switch to customer mode.
 */
export function RiderLocationProvider({ children }: { children: React.ReactNode }) {
  const { user, isRider } = useAuth();
  const subscriptionRef = useRef<LocationSubscription | null>(null);
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [resumeTick, setResumeTick] = useState(0);

  const stop = useCallback(() => {
    stopLocationSharing(subscriptionRef.current);
    subscriptionRef.current = null;
    setSharing(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    // No state update on this path — non-riders see a null profile because the
    // context value below is derived from `isRider`.
    if (!isRider) return;
    const next = await fetchRiderProfile();
    setProfile(next);
  }, [isRider]);

  // Load the profile whenever the session identity changes. The fetch lives
  // inside the effect (like the payment/order pollers) so no component-scope
  // setState helper is called synchronously from an effect body.
  useEffect(() => {
    if (!isRider) return;
    let cancelled = false;
    void (async () => {
      const next = await fetchRiderProfile();
      if (!cancelled) setProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [isRider, user?.id]);

  // Start/stop based on approval and status, not on which screen is open.
  useEffect(() => {
    const approved = profile?.approvalStatus === 'approved';
    const wanted = isRider && approved && shouldShareLocation(profile?.status);
    let cancelled = false;

    void (async () => {
      if (!wanted) {
        // Yield once so no state update lands synchronously inside the effect
        // body (React Compiler rule); then tear the watcher down.
        await Promise.resolve();
        if (cancelled) return;
        stopLocationSharing(subscriptionRef.current);
        subscriptionRef.current = null;
        setSharing(false);
        return;
      }
      if (subscriptionRef.current) return;

      // The socket is opened before the first fix so uploads prefer the
      // authenticated, low-latency transport.
      await getSocket();
      const subscription = await startLocationSharing();
      if (cancelled) {
        // The effect was torn down while the watcher was starting (logout /
        // mode switch). Tear the fresh subscription down immediately so GPS
        // does not keep uploading in the background, and do not touch state —
        // this component may already be unmounted.
        stopLocationSharing(subscription);
        return;
      }
      if (!subscription) {
        setPermissionDenied(true);
        return;
      }
      subscriptionRef.current = subscription;
      setPermissionDenied(false);
      setSharing(true);
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [isRider, profile?.approvalStatus, profile?.status, resumeTick, stop]);

  // Ending the session must close the socket so no further events are received or
  // sent with a dead token. Keyed on having a session rather than on rider
  // status: this socket is shared by order tracking and admin presence too, so
  // closing it for every non-rider would silently break those features.
  useEffect(() => {
    if (!user) closeSocket();
  }, [user]);

  // Backgrounding the app should not keep a foreground-only watcher alive, and
  // coming back must restart it. Without the tick, a rider who switched away
  // would stay permanently offline for the rest of the session.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') setResumeTick((t) => t + 1);
      else stop();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [stop]);

  const value = useMemo<RiderLocationState>(
    () => ({ sharing, permissionDenied, profile: isRider ? profile : null, refreshProfile }),
    [sharing, permissionDenied, profile, refreshProfile, isRider],
  );

  return <RiderLocationContext.Provider value={value}>{children}</RiderLocationContext.Provider>;
}

export function useRiderLocation(): RiderLocationState {
  return useContext(RiderLocationContext);
}
