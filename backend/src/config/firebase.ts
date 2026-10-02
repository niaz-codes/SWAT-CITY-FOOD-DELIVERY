// ============================================================
// Swat City Backend - Firebase Cloud Messaging (server side)
//
// firebase-admin v14 is modular: credentials come from 'firebase-admin/app'
// and the client from 'firebase-admin/messaging'. The pre-v14 namespaced API
// (`admin.credential.cert(...)` / `admin.messaging()`) no longer exists on the
// package root, so both shapes are probed below and the working one is used.
//
// Configured from FIREBASE_SERVICE_ACCOUNT_JSON (preferred, single line) or
// FIREBASE_SERVICE_ACCOUNT_PATH (local file). When Firebase is absent the
// server keeps running with in-app + Socket.IO notifications only.
// ============================================================

import fs from 'fs';
import { env, firebaseConfigured } from './env';

type PushPayload = Record<string, unknown>;

export interface PushResult {
  successCount: number;
  failureCount: number;
  /** Tokens FCM reported as permanently invalid — safe to delete. */
  invalidTokens: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

let resolved: {
  send: (token: string, payload: AnyRecord) => Promise<unknown>;
  sendMulticast: (tokens: string[], payload: AnyRecord) => Promise<{
    successCount: number;
    failureCount: number;
    responses: { success: boolean; error?: { code?: string } }[];
  }>;
} | null = null;

let initError: string | null = null;

/**
 * FCM codes that mean "this token is gone forever, stop sending to it".
 * Everything else (network blip, quota) must NOT cause a token removal.
 */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

function loadServiceAccount(): Record<string, unknown> {
  const inline = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(inline);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the service account file as a single line.',
      );
    }
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id / client_email / private_key');
    }
    return parsed;
  }

  const filePath = env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (filePath) {
    const resolvedPath = fs.existsSync(filePath) ? filePath : `backend/${filePath}`;
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH does not exist: ${filePath}`);
    }
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as Record<string, unknown>;
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  }

  return {
    project_id: env.FIREBASE_PROJECT_ID,
    client_email: env.FIREBASE_CLIENT_EMAIL,
    private_key: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

/**
 * Builds the transport. Supports both the v14 modular API and the legacy
 * namespaced API so the file keeps working if firebase-admin is pinned down.
 */
function initFirebase(): NonNullable<typeof resolved> {
  const serviceAccount = loadServiceAccount();

  // --- Preferred: firebase-admin >= 13 modular entry points ---------------
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const appModule = require('firebase-admin/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const messagingModule = require('firebase-admin/messaging');

    if (typeof appModule?.cert === 'function' && typeof messagingModule?.getMessaging === 'function') {
      const existing = appModule.getApps?.() ?? [];
      const app = existing[0] ?? appModule.initializeApp({ credential: appModule.cert(serviceAccount) });
      const messaging = messagingModule.getMessaging(app);

      return {
        send: (token, payload) => messaging.send(token as never, payload as never),
        sendMulticast: (tokens, payload) => messaging.sendEachForMulticast({ tokens, ...payload } as never),
      };
    }
  } catch (error) {
    initError = `modular API unavailable: ${(error as Error).message}`;
  }

  // --- Fallback: legacy namespaced API ------------------------------------
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');
    if (typeof admin?.credential?.cert === 'function' && typeof admin.messaging === 'function') {
      if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      return {
        send: (token, payload) => admin.messaging().send({ token, ...payload }),
        sendMulticast: (tokens, payload) => admin.messaging().sendEachForMulticast({ tokens, ...payload }),
      };
    }
  } catch (error) {
    initError = `legacy API unavailable: ${(error as Error).message}`;
  }

  throw new Error(`Unsupported firebase-admin layout. ${initError ?? ''}`.trim());
}

function getFirebase(): NonNullable<typeof resolved> | null {
  if (!firebaseConfigured) return null;
  if (resolved) return resolved;
  if (initError) return null;

  try {
    resolved = initFirebase();
    return resolved;
  } catch (error) {
    initError = (error as Error).message;
    // eslint-disable-next-line no-console
    console.error('[push] Firebase Admin initialisation failed:', initError);
    return null;
  }
}

/** Shared platform block for both single and multicast sends. */
function buildMessage(token: string | null, payload: PushPayload): AnyRecord {
  const title = String(payload.title ?? 'Swat City');
  const body = String(payload.body ?? '');

  return {
    ...(token ? { token } : {}),
    notification: { title, body },
    // FCM requires every data value to be a string.
    data: Object.fromEntries(
      Object.entries(payload)
        .filter(([k, v]) => v !== undefined && v !== null && k !== 'title' && k !== 'body')
        .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
    ),
    android: {
      priority: 'high',
      notification: {
        channelId: payload.channelId ? String(payload.channelId) : 'default',
        sound: 'default',
      },
    },
    aps: {
      sound: 'default',
      // Show the banner even while the app is open in the foreground (iOS).
      alert: { title, body },
      'content-available': 1,
    },
  };
}

/** True only for codes that prove the token is permanently dead. */
export function isInvalidTokenCode(code: string | undefined): boolean {
  return Boolean(code && INVALID_TOKEN_CODES.has(code));
}

/**
 * Send one push. Returns false instead of throwing so a push failure can never
 * break the request that triggered it.
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: PushPayload,
): Promise<boolean> {
  if (!deviceToken) return false;
  const fb = getFirebase();
  if (!fb) return false;

  try {
    await fb.send(deviceToken, buildMessage(deviceToken, payload));
    return true;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    // Only a definitive "not registered" is worth pruning; anything else keeps
    // the token so a transient failure does not cost the user push delivery.
    if (isInvalidTokenCode(code)) {
      // eslint-disable-next-line no-console
      console.warn(`[push] dropping dead token (${code})`);
    }
    // eslint-disable-next-line no-console
    else {
      console.warn('[push] send failed:', code ?? (error as Error).message);
    }
    return false;
  }
}

/**
 * Send the same notification to many tokens at once (FCM caps a batch at 500)
 * and report which tokens are permanently invalid so the caller can prune them.
 */
export async function sendMulticastNotification(
  tokens: string[],
  payload: PushPayload,
): Promise<PushResult> {
  const result: PushResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
  const valid = tokens.filter((t) => typeof t === 'string' && t.length > 0);
  if (valid.length === 0) return result;

  const fb = getFirebase();
  if (!fb) {
    result.failureCount = valid.length;
    return result;
  }

  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500);
    try {
      const response = await fb.sendMulticast(chunk, payload);
      result.successCount += response.successCount ?? 0;
      result.failureCount += response.failureCount ?? 0;

      (response.responses ?? []).forEach((r, idx) => {
        if (r.success) return;
        const token = chunk[idx];
        if (token && isInvalidTokenCode(r.error?.code)) result.invalidTokens.push(token);
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      result.failureCount += chunk.length;
      // A batch-level invalid-token error does mean every token is dead.
      if (isInvalidTokenCode(code)) result.invalidTokens.push(...chunk);
      // eslint-disable-next-line no-console
      console.warn('[push] multicast batch failed:', code ?? (error as Error).message);
    }
  }

  return result;
}

/** Startup self-check so misconfiguration is obvious in the deploy logs. */
export function describeFirebaseStatus(): {
  configured: boolean;
  ready: boolean;
  error: string | null;
} {
  const ready = getFirebase() !== null;
  return { configured: firebaseConfigured, ready, error: initError };
}