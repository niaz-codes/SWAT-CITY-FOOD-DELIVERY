// ============================================================
// Swat City Backend - Firebase Cloud Messaging v1 (server side)
//
// Direct FCM delivery for devices that register a real FCM token
// (Android APK/release builds with the same Firebase project). Expo Push
// stays as the primary transport for `ExponentPushToken[...]` devices;
// backend/src/services/notification.service.ts routes each token to the
// transport its shape belongs to, so a mixed token list is fine.
//
// Credentials come from FIREBASE_SERVICE_ACCOUNT_JSON — either the raw JSON
// document or its Base64 encoding (easier as an env var on Railway).
// Missing credentials simply disable the transport: notifications then fall
// back to in-app + Socket.IO + Expo Push, never an error at boot.
//
// v1 send errors that mean "this token is gone forever":
//   registration-token-not-registered, invalid-argument on an rmr token
// Everything else (quota, internal, unavailable) must NOT prune a token.
// ============================================================

import { env } from './env';

export interface FcmPushPayload {
  title: string;
  body: string;
  /** Flat string map delivered to the app as `content.data`. */
  data?: Record<string, string>;
  /** Collapse id so a burst of updates replaces itself in the tray. */
  collapseId?: string;
}

export interface FcmPushResult {
  successCount: number;
  failureCount: number;
  /** Tokens FCM reported as permanently invalid - safe to delete. */
  invalidTokens: string[];
}

// Lazy: firebase-admin is a heavy import that is pointless until a service
// account exists, and a broken credential must never crash the API boot.
type MessagingApi = {
  sendEachForMulticast: (
    message: {
      tokens: string[];
      notification: { title: string; body: string };
      data?: Record<string, string>;
      android?: { priority: 'high'; collapseKey?: string };
    },
  ) => Promise<{
    successCount: number;
    failureCount: number;
    responses: {
      success: boolean;
      error?: Error & { code?: string };
    }[];
  }>;
};

let messagingPromise: Promise<MessagingApi | null> | null = null;
let initFailed = false;

/**
 * True when a FCM v1 send can actually be attempted: explicitly enabled and
 * a service-account document present.
 */
export function fcmConfigured(): boolean {
  if (env.FCM_ENABLED === 'false') return false;
  return Boolean(serviceAccountDocument());
}

function serviceAccountDocument(): string | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  return raw;
}

/** Decode the env var into the credential object (raw JSON or Base64). */
function parseServiceAccount(): Record<string, unknown> | null {
  const raw = serviceAccountDocument();
  if (!raw) return null;
  try {
    const candidate = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    // A real service account carries a private key + client email; accept both
    // the snake_case Google shape and be quiet about everything else.
    if (parsed.private_key && parsed.client_email) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * The FCM Messaging handle, or null when the transport is disabled. The
 * promise is cached so a cold path costs one import per process.
 */
function messaging(): Promise<MessagingApi | null> {
  if (!fcmConfigured()) return Promise.resolve(null);
  if (!messagingPromise || initFailed) {
    messagingPromise = (async () => {
      try {
        // firebase-admin is loaded through variables on purpose:
        //   1. lazy — the SDK is pointless until a service account exists and
        //      its import is heavy;
        //   2. the specifier is not a literal, so the repo-root eslint
        //      resolver (which cannot see backend/node_modules) never tries
        //      to resolve it. Runtime behaviour is identical: a plain Node
        //      dynamic import.
        const appSpecifier = 'firebase-admin/app';
        const msgSpecifier = 'firebase-admin/messaging';
        const adminApp = (await import(appSpecifier)) as typeof import('firebase-admin/app');
        const adminMsg = (await import(msgSpecifier)) as typeof import('firebase-admin/messaging');
        const { cert, initializeApp, getApps } = adminApp;
        const { getMessaging } = adminMsg;
        const credential = parseServiceAccount();
        if (!credential) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not a valid service account');
        }
        const options = {
          credential: cert(credential as never),
          ...(env.FIREBASE_PROJECT_ID ? { projectId: env.FIREBASE_PROJECT_ID } : {}),
        };
        if (getApps().length === 0) initializeApp(options);
        return getMessaging() as unknown as MessagingApi;
      } catch (error) {
        initFailed = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[fcm] transport disabled - initialization failed:',
          (error as Error).message,
        );
        return null;
      }
    })();
  }
  return messagingPromise;
}

/**
 * Send one notification to many FCM tokens (batched at FCM's 500-token
 * multicast limit) and report the tokens that are permanently invalid so the
 * caller can prune them. Never throws - a push failure must not break the
 * request that triggered it.
 */
export async function sendFcmMulticastNotification(
  tokens: string[],
  payload: FcmPushPayload,
): Promise<FcmPushResult> {
  const result: FcmPushResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
  const valid = [...new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 0))];
  if (valid.length === 0) return result;

  const api = await messaging();
  if (!api) {
    result.failureCount = valid.length;
    return result;
  }

  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.data ?? {})) {
    if (value === undefined || value === null) continue;
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  // FCM multicast accepts at most 500 tokens per call.
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500);
    try {
      const response = await api.sendEachForMulticast({
        tokens: chunk,
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: 'high', ...(payload.collapseId ? { collapseKey: payload.collapseId } : {}) },
      });
      result.successCount += response.successCount;
      result.failureCount += response.failureCount;
      response.responses.forEach((res, idx) => {
        const code = res.error?.code ?? '';
        if (!res.success && isDeadTokenError(code)) {
          const token = chunk[idx];
          if (token) result.invalidTokens.push(token);
        }
      });
    } catch (error) {
      result.failureCount += chunk.length;
      // eslint-disable-next-line no-console
      console.warn('[fcm] batch failed:', (error as Error).message);
    }
  }

  return result;
}

/** v1 error codes that mean the token is gone and will never deliver again. */
function isDeadTokenError(code: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

/** Startup self-check so misconfiguration is obvious in the deploy logs. */
export function describeFcmStatus(): {
  enabled: boolean;
  serviceAccountConfigured: boolean;
  projectIdConfigured: boolean;
} {
  return {
    enabled: fcmConfigured(),
    serviceAccountConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()),
    projectIdConfigured: Boolean(env.FIREBASE_PROJECT_ID?.trim()),
  };
}
