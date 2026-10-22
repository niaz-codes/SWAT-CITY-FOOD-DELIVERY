// ============================================================
// Swat City Backend - Expo Push Service (server side)
//
// The mobile app runs through Expo Go, which cannot host React Native Firebase
// (its native code is not in the prebuilt binary). Push therefore goes over the
// Expo Push Service instead: `expo-notifications` on the device hands us an
// `ExponentPushToken[...]` token, and this module posts it to the Expo Push API.
//
// FCM is kept alongside for devices that register a real FCM token (a custom
// build, or a token issued before the switch), so a mixed token list is fine -
// backend/src/services/notification.service.ts routes by token shape.
//
// No SDK dependency: the API is a plain HTTPS POST, so `fetch` is enough.
//
// Ticket errors that mean "this token is gone forever":
//   DeviceNotRegistered, DeviceNotFound
// Everything else (rate limit, gateway hiccup) must NOT prune a token.
// ============================================================

import { env } from './env';

const SEND_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 tickets per request. */
const BATCH_LIMIT = 100;

/** Per-request timeout. A hung gateway must not pin the event loop. */
const TIMEOUT_MS = 15000;

export interface ExpoPushPayload {
  title: string;
  body: string;
  /** Flat string map delivered to the app as `content.data`. */
  data?: Record<string, string>;
  /** Android channel id; must exist on the device (we create `default`). */
  channelId?: string;
  /** Collapse id so a burst of updates replaces itself in the tray. */
  collapseId?: string;
}

export interface ExpoPushResult {
  successCount: number;
  failureCount: number;
  /** Tokens Expo reported as permanently invalid - safe to delete. */
  invalidTokens: string[];
}

interface TicketResponse {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const DEAD_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'DeviceNotFound']);

/** Both the legacy `ExponentPushToken[...]` and the current `ExpoPushToken[...]`. */
export function isExpoPushToken(token: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token.trim());
}

/**
 * Expo push tokens only mean something against an Expo project, so the delivery
 * is skipped outright when the project is not configured. Notifications then
 * fall back to the in-app list + Socket.IO, which is the correct degraded mode.
 */
export function expoPushConfigured(): boolean {
  return isProductionSafe();
}

function isProductionSafe(): boolean {
  // The Expo Push API needs no credentials of its own, but an explicit opt-out
  // is honoured so a deployment can keep FCM as the only transport.
  return env.EXPO_PUSH_ENABLED !== 'false';
}

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  // Optional: needed only for Expo accounts with push-security enabled or for
  // enhanced delivery receipts.
  const accessToken = env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) base.Authorization = `Bearer ${accessToken}`;
  return base;
}

function buildMessage(payload: ExpoPushPayload): Record<string, unknown> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.data ?? {})) {
    if (value === undefined || value === null) continue;
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  return {
    title: payload.title,
    body: payload.body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: payload.channelId ?? 'default',
    // Expo rejects unknown message fields, so only documented keys are sent.
    // `channelId` is Android-only and `mutableContent` iOS-only; each platform
    // ignores the other's key.
    ...(payload.collapseId ? { collapseId: payload.collapseId } : {}),
    mutableContent: true,
  };
}

async function postTickets(tickets: Record<string, unknown>[]): Promise<TicketResponse[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(tickets),
      signal: controller.signal,
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[push] Expo Push API returned HTTP ${response.status}`);
      return [];
    }

    const body = (await response.json()) as { data?: TicketResponse[] };
    return Array.isArray(body.data) ? body.data : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one push. Returns false instead of throwing so a push failure can never
 * break the request that triggered it.
 */
export async function sendExpoPushNotification(
  deviceToken: string,
  payload: ExpoPushPayload,
): Promise<boolean> {
  if (!deviceToken || !expoPushConfigured()) return false;

  try {
    const [ticket] = await postTickets([{ to: deviceToken, ...buildMessage(payload) }]);
    if (!ticket) return false;

    if (ticket.status === 'error') {
      // eslint-disable-next-line no-console
      console.warn(
        `[push] Expo ticket error: ${ticket.details?.error ?? ticket.message ?? 'unknown'}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[push] Expo send failed:', (error as Error).message);
    return false;
  }
}

/**
 * Send the same notification to many tokens (batched at the Expo limit of 100)
 * and report which tokens are permanently invalid so the caller can prune them.
 */
export async function sendExpoMulticastNotification(
  tokens: string[],
  payload: ExpoPushPayload,
): Promise<ExpoPushResult> {
  const result: ExpoPushResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
  const valid = tokens.filter((t) => typeof t === 'string' && t.length > 0);
  if (valid.length === 0 || !expoPushConfigured()) {
    result.failureCount = valid.length;
    return result;
  }

  const message = buildMessage(payload);

  for (let i = 0; i < valid.length; i += BATCH_LIMIT) {
    const chunk = valid.slice(i, i + BATCH_LIMIT);
    try {
      const tickets = await postTickets(chunk.map((to) => ({ to, ...message })));

      if (tickets.length === 0) {
        // Transport failure: no ticket means no verdict, so keep the tokens.
        result.failureCount += chunk.length;
        continue;
      }

      tickets.forEach((ticket, idx) => {
        const token = chunk[idx];
        if (ticket?.status === 'ok') {
          result.successCount += 1;
          return;
        }
        result.failureCount += 1;
        const code = ticket?.details?.error;
        if (token && code && DEAD_TOKEN_ERRORS.has(code)) {
          result.invalidTokens.push(token);
        }
      });
    } catch (error) {
      result.failureCount += chunk.length;
      // eslint-disable-next-line no-console
      console.warn('[push] Expo batch failed:', (error as Error).message);
    }
  }

  return result;
}

/** Startup self-check so misconfiguration is obvious in the deploy logs. */
export function describeExpoPushStatus(): {
  enabled: boolean;
  accessTokenConfigured: boolean;
} {
  return {
    enabled: expoPushConfigured(),
    accessTokenConfigured: Boolean(env.EXPO_ACCESS_TOKEN?.trim()),
  };
}
