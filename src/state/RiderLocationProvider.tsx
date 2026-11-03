import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import type { LocationSubscription } from 'expo-location';
import {
  isDeliveryTaskRunning,
  shouldShareLocation,
  startLocationSharing,
  stopDeliveryTask,
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
  // Which transport currently owns the GPS upload: a plain foreground watcher
  // (`watch`) or the Android foreground-service task that outlives
  // backgrounding (`task`) while a delivery is active. Transitions between the
  // two must tear down the old one first, or BOTH could keep sending fixes.
  const modeRef = useRef<'none' | 'watch' | 'task'>('none');
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [resumeTick, setResumeTick] = useState(0);

  const stop = useCallback(() => {
    stopLocationSharing(subscriptionRef.current);
    subscriptionRef.current = null;
    if (modeRef.current === 'task') {
      void stopDeliveryTask();
    }
    modeRef.current = 'none';
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
  // A `busy` rider (active delivery) additionally runs the Android
  // foreground-service GPS task, so positions keep flowing in the background
  // (rider inside Google Maps / phone locked) and the customer's map stays
  // live. Idle online riders use the plain foreground watcher, which is torn
  // down on backgrounding exactly as before.
  useEffect(() => {
    const approved = profile?.approvalStatus === 'approved';
    const busy = profile?.status === 'busy';
    const wanted = Boolean(isRider && approved && shouldShareLocation(profile?.status));
    let cancelled = false;

    void (async () => {
      if (!wanted) {
        // Yield once so no state update lands synchronously inside the effect
        // body (React Compiler rule); then tear everything down — this also
        // kills a foreground-service task left registered by an app kill.
        await Promise.resolve();
        if (cancelled) return;
        stop();
        return;
      }

      // Delivery just finished: bring the foreground service down before the
      // watcher takes over, so the OS notification disappears immediately.
      if (modeRef.current === 'task' && !busy) {
        await stopDeliveryTask();
        if (cancelled) return;
        modeRef.current = 'none';
      }
      // Rider became busy while a plain watcher runs: upgrade to the
      // foreground service (a second transport must not stack on top).
      if (modeRef.current === 'watch' && busy) {
        stopLocationSharing(subscriptionRef.current);
        subscriptionRef.current = null;
        modeRef.current = 'none';
      }
      if (modeRef.current === 'task' && busy) {
        setSharing(true);
        return;
      }
      if (modeRef.current === 'watch' && !busy) {
        setSharing(true);
        return;
      }
      if (modeRef.current !== 'none') return;

      await getSocket();
      const subscription = await startLocationSharing(undefined, busy);
      if (cancelled) {
        // The effect was torn down while the transport was starting (logout /
        // mode switch). Tear the fresh one down immediately so GPS does not
        // keep uploading in the background, and do not touch state — this
        // component may already be unmounted.
        stopLocationSharing(subscription);
        if (busy && !subscription) void stopDeliveryTask();
        return;
      }

      if (!subscription) {
        if (busy) {
          // The foreground-service task accepted (Android): it persists across
          // backgrounding and owns upload from here on.
          modeRef.current = 'task';
          setPermissionDenied(false);
          setSharing(true);
          return;
        }
        setPermissionDenied(true);
        return;
      }

      // Idle-online watcher. A leftover task from a previous session must go,
      // otherwise two transports would upload the same fixes.
      if (Platform.OS === 'android' && (await isDeliveryTaskRunning())) {
        await stopDeliveryTask();
      }
      if (cancelled) {
        stopLocationSharing(subscription);
        return;
      }
      subscriptionRef.current = subscription;
      modeRef.current = 'watch';
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
  // Exception: mid-delivery (`busy`) the subscription carries the Android
  // foregroundService option, so backgrounding does NOT kill it — the rider
  // may be navigating in another app while the customer tracks the dot.
  useEffect(() => {
    const busyDelivery = profile?.status === 'busy';
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') setResumeTick((t) => t + 1);
      else if (!(next === 'background' && busyDelivery)) stop();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [stop, profile?.status]);

  const value = useMemo<RiderLocationState>(
    () => ({ sharing, permissionDenied, profile: isRider ? profile : null, refreshProfile }),
    [sharing, permissionDenied, profile, refreshProfile, isRider],
  );

  return <RiderLocationContext.Provider value={value}>{children}</RiderLocationContext.Provider>;
}

export function useRiderLocation(): RiderLocationState {
  return useContext(RiderLocationContext);
}
