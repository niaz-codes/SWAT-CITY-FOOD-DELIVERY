import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationsNS from 'expo-notifications';

/**
 * Mobile side of push notifications.
 *
 * The backend (backend/src/services/notification.service.ts) fans out
 * role-targeted pushes for order and ride lifecycle events; this module owns
 * permission prompts, token acquisition, token registration with the backend,
 * and the notification tap states Android/iOS require.
 *
 * Two hard platform rules drive the shape of this file:
 *
 *   1. React Native Firebase can never run here. Its native code is not
 *      compiled into the prebuilt Expo Go binary, so importing it throws
 *      `Native module NativeRNFBTurboApp is not registered`. expo-notifications
 *      is used instead, and it IS bundled into Expo Go.
 *
 *   2. Remote push in Expo Go is asymmetric as of SDK 53:
 *        - iOS     -> WORKS in Expo Go (Expo can auto-configure APNs with EAS).
 *        - Android -> REMOVED. `getExpoPushTokenAsync` / `getDevicePushTokenAsync`
 *          / `addPushTokenListener` throw
 *          "Android Push notifications ... was removed from Expo Go".
 *      So the module is loaded lazily behind a capability check: on Android in
 *      Expo Go every remote-push entry point degrades to a no-op instead of
 *      throwing and taking the whole bundle down. Local notifications (tray
 *      channels, permission prompts) still work there.
 *
 * Tokens are Expo Push Service tokens, delivered by the backend over the Expo
 * Push API; FCM tokens already in the database keep going through firebase-admin.
 *
 * Navigation from a tap is deliberately NOT handled here. `RootNavigator` passes
 * its own handler so routing stays next to the routes it targets.
 */

const TOKEN_KEY = '@swat/expo-push-token';

/** Android tray channel. Created on app start so background banners have a home. */
const ANDROID_CHANNEL_ID = 'default';

/**
 * expo-notifications is required lazily. On Android inside Expo Go, merely
 * touching its push APIs throws, so a throwing module load must never be able to
 * abort bundle evaluation.
 */
type NotificationsModule = typeof NotificationsNS;

let notificationsModule: NotificationsModule | null = null;
let notificationsLoadFailed = false;

/** The module, or null when it could not be loaded in this runtime. */
function notifications(): NotificationsModule | null {
  if (notificationsModule || notificationsLoadFailed) return notificationsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch {
    notificationsLoadFailed = true;
  }
  return notificationsModule;
}

/**
 * True only where a remote push token can actually be obtained.
 * iOS needs a physical device; Android needs anything except Expo Go.
 */
function remotePushSupported(): boolean {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return false;
  return Platform.OS === 'android' ? true : Device.isDevice;
}

/** Local-notification setup: banner while foregrounded, sound, no badge. */
function initLocalPresentation(): void {
  const N = notifications();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        // Expo Go / SDK 53+ replaced `shouldShowAlert` with banner + list flags.
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Handler is cosmetic; a failure must not stop the app booting.
  }
}

export type AppNotificationPayload = {
  /** Backend notification _id, used to mark the notification read. */
  notificationId?: string;
  /** Notification kind, e.g. order_placed / order_delivered / ride_started. */
  kind?: string;
  /** Domain id the tap should deep-link to (order id, ride id, ...). */
  targetId?: string;
  title?: string;
  body?: string;
};

/**
 * Push registration needs the Expo project id. It comes from the linked EAS
 * project (`extra.eas.projectId`, written by `eas init`) or from the
 * EXPO_PUBLIC_EAS_PROJECT_ID env var, and is inlined by Metro at build time.
 */
function resolveProjectId(): string | undefined {
  const fromExtra = (
    Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined
  )?.projectId;
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return fromExtra || fromEnv || undefined;
}

/**
 * Normalises the notification payload into the flat shape the app navigates with.
 * Both EPS (`data`) and the legacy FCM field names are accepted so the backend
 * can send either without an app change.
 */
function toPayload(
  data: Record<string, unknown> | null | undefined,
): AppNotificationPayload | null {
  if (!data) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;

  const payload: AppNotificationPayload = {
    notificationId: str(data.notificationId) ?? str(data.notification_id),
    kind: str(data.kind) ?? str(data.type),
    targetId: str(data.targetId) ?? str(data.target_id),
    title: str(data.title),
    body: str(data.body),
  };

  return Object.values(payload).some(Boolean) ? payload : null;
}

/**
 * Notification ids already routed, so a cold start that is also seen by the
 * response listener cannot navigate twice.
 */
const handledNotificationIds = new Set<string>();

async function readPermissionState(): Promise<NotificationsNS.PermissionStatus | null> {
  const N = notifications();
  if (!N) return null;
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return current.status;
    if (current.canAskAgain === false) return current.status;

    const requested = await N.requestPermissionsAsync();
    return requested.status;
  } catch {
    return N.PermissionStatus.DENIED;
  }
}

/** Android 13+ grant, requested through the platform API as a safety net. */
async function ensureAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: 'Allow notifications',
    message: 'Swat City uses notifications for order and ride updates.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

let channelReady: Promise<void> | null = null;

/** Idempotent Android channel setup; a no-op everywhere else. */
function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    const N = notifications();
    if (!N) return Promise.resolve();
    channelReady = N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Order and ride updates',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0E9488',
      sound: 'default',
    })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return channelReady;
}

/**
 * Prepares the module: foreground presentation handler plus the Android tray
 * channel. Safe on every launch, in Expo Go and in a development build.
 */
export async function initPush(): Promise<void> {
  initLocalPresentation();
  await ensureAndroidChannel();
}

/**
 * Resolves the Expo push token for this install, requesting permission first.
 * Returns null whenever a token is unobtainable - declined permission, Expo Go
 * on Android, iOS simulator, missing project id. Never throws.
 */
export async function getPushToken(): Promise<string | null> {
  if (!remotePushSupported()) return null;

  const N = notifications();
  if (!N) return null;

  try {
    const status = await readPermissionState();
    const granted =
      status === N.PermissionStatus.GRANTED || (await ensureAndroidPermission());
    if (!granted) return null;

    await ensureAndroidChannel();

    const projectId = resolveProjectId();
    if (!projectId) {
      if (__DEV__) {
        console.warn(
          '[push] No Expo project id. Run `eas init` (or set EXPO_PUBLIC_EAS_PROJECT_ID) ' +
            'so getExpoPushTokenAsync can register this device.',
        );
      }
      return null;
    }

    const { data } = await N.getExpoPushTokenAsync({ projectId });
    return data ?? null;
  } catch {
    // Expo Go on Android throws here by design; treat as "no push available".
    return null;
  }
}

async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Ensures the backend has this device's token.
 *
 * Registers only when the token differs from the cached one, so an app launch
 * costs no extra request. Failures are swallowed: a missing push token must
 * never block the login flow, and the next foreground/launch retries.
 */
export async function ensurePushTokenRegistered(
  register: (token: string) => Promise<void>,
): Promise<boolean> {
  const token = await getPushToken();
  if (!token) return false;

  const previous = await getStoredToken();
  if (previous === token) return true;

  try {
    await register(token);
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Foreground delivery.
 *
 * Handles all three delivery states:
 *   - foreground  -> this listener fires (the handler above also shows a banner)
 *   - background  -> system tray, tap arrives via addNotificationResponseReceivedListener
 *   - terminated  -> system tray, tap arrives via getLastNotificationResponseAsync
 *
 * expo-notifications has no JS token-rotation event; a rotated token is picked up
 * by the next `ensurePushTokenRegistered` call (login) or app launch.
 *
 * Returns a teardown function.
 */
export function registerPushHandlers(
  onForeground: (payload: AppNotificationPayload) => void,
): () => void {
  const N = notifications();
  if (!N) return () => {};

  let subscription: NotificationsNS.EventSubscription | undefined;
  try {
    subscription = N.addNotificationReceivedListener((notification) => {
      const payload = toPayload(notification.request.content.data);
      if (payload) onForeground(payload);
    });
  } catch {
    return () => {};
  }

  return () => {
    try {
      subscription?.remove();
    } catch {
      // Listener already torn down by the native module.
    }
  };
}

/** Tap that cold-started the app (terminated -> open). */
export async function getInitialNotification(
  handler: (payload: AppNotificationPayload) => void,
): Promise<void> {
  const N = notifications();
  if (!N) return;

  try {
    const response = await N.getLastNotificationResponseAsync();
    if (!response) return;

    const id = response.notification.request.identifier;
    if (handledNotificationIds.has(id)) return;
    handledNotificationIds.add(id);

    const payload = toPayload(response.notification.request.content.data);
    if (payload) handler(payload);
  } catch {
    // No cold-start notification.
  }
}

/** Tap while the app was in the background. */
export function onNotificationOpenedApp(
  handler: (payload: AppNotificationPayload) => void,
): () => void {
  const N = notifications();
  if (!N) return () => {};

  let subscription: NotificationsNS.EventSubscription;
  try {
    subscription = N.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      if (handledNotificationIds.has(id)) return;
      handledNotificationIds.add(id);

      const payload = toPayload(response.notification.request.content.data);
      if (payload) handler(payload);
    });
  } catch {
    return () => {};
  }

  return () => {
    try {
      subscription.remove();
    } catch {
      // Already removed.
    }
  };
}

/** Deep-link into this app's OS notification settings. */
export function openNotificationSettings(): Promise<void> {
  if (Platform.OS === 'ios') return Linking.openSettings();

  Alert.alert(
    'Notifications are off',
    'Enable notifications for Swat City in your device settings to receive order and ride updates.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open settings', onPress: () => void Linking.openSettings() },
    ],
  );
  return Promise.resolve();
}

/**
 * Current permission state for the notifications settings screen.
 *
 * Android 13+ POST_NOTIFICATIONS is read through the `PermissionsAndroid` grant
 * because expo-notifications reports it as undetermined until the system prompt
 * has run once.
 */
export function usePushPermissionState(): { granted: boolean | null; request: () => Promise<boolean> } {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === 'android') {
          if (Platform.Version < 33) {
            if (!cancelled) setGranted(true);
            return;
          }
          const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          if (!cancelled) setGranted(ok);
          return;
        }

        const N = notifications();
        if (!N) {
          if (!cancelled) setGranted(null);
          return;
        }
        const current = await N.getPermissionsAsync();
        if (!cancelled) setGranted(current.granted);
      } catch {
        if (!cancelled) setGranted(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const ok = await ensureAndroidPermission();
        setGranted(ok);
        return ok;
      }

      const N = notifications();
      if (!N) return false;
      const status = await readPermissionState();
      const ok = status === N.PermissionStatus.GRANTED;
      setGranted(ok);
      return ok;
    } catch {
      return false;
    }
  }, []);

  return { granted, request };
}
