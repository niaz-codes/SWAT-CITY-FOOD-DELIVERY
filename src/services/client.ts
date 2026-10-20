import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Centralized API client for the Swat City backend.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL, which is inlined at build time
 * (eas.json `env` for EAS builds, .env for local runs). The fallback is the
 * production backend so a missing variable degrades to "live but misconfigured"
 * rather than shipping a dead emulator/loopback URL to a real device.
 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://backend-production-73f5.up.railway.app/api'
).replace(/\/+$/, '');

const TOKENS_KEY = '@swat/tokens';
const REQUEST_TIMEOUT_MS = 12_000;

export type ApiTokens = {
  accessToken: string;
  refreshToken: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ApiError extends Error {
  readonly status?: number;
  readonly kind: 'http' | 'network';

  constructor(message: string, status?: number, kind: 'http' | 'network' = 'http') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'network';
}

/**
 * Turns any thrown value into a message safe to show in a toast. ApiError
 * already carries server-provided copy; anything else (TypeError from a bad
 * response shape, etc.) falls back to the supplied default rather than leaking
 * an internal message to the user.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

export async function getApiTokens(): Promise<ApiTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as ApiTokens) : null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const tokens = await getApiTokens();
  return tokens?.accessToken ?? null;
}

export async function setApiTokens(tokens: ApiTokens | null): Promise<void> {
  if (tokens) {
    await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } else {
    await AsyncStorage.removeItem(TOKENS_KEY);
  }
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlDecode(segment: string): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of segment.replace(/-/g, '+').replace(/_/g, '/')) {
    if (ch === '=') break;
    const idx = B64_CHARS.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Reads the `exp` claim from a JWT without verifying it. The signature is the
 * backend's business; the client only needs to know whether the token it is
 * about to send has already expired, so it can drop the session instead of
 * firing doomed requests. A non-JWT token returns null and is left for the
 * server to accept or reject.
 */
function jwtExpiryMs(token: string): number | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const match = /"exp"\s*:\s*(\d+)/.exec(base64UrlDecode(segments[1]));
  return match ? Number(match[1]) * 1000 : null;
}

export async function getAccessTokenExpiry(): Promise<number | null> {
  const token = await getAccessToken();
  return token ? jwtExpiryMs(token) : null;
}

/**
 * True when there is no usable access token, or the one on disk has expired.
 * The backend issues short-lived access tokens, so this is what distinguishes
 * "signed in" from "still holding a dead session".
 */
export async function isAccessTokenExpired(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return true;
  const exp = jwtExpiryMs(token);
  return exp === null ? false : Date.now() >= exp;
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/**
 * Lets the auth layer react to a rejected token without this module importing
 * React or the navigator. Returns an unsubscribe function.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

async function dropExpiredSession(): Promise<void> {
  await setApiTokens(null);
  for (const listener of sessionExpiredListeners) listener();
}

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  meta?: unknown;
  message?: string;
};

type ExecuteResult = {
  httpStatus: number;
  body: ApiEnvelope | null;
};

async function execute(
  rawUrl: string,
  init: RequestInit & { signal?: AbortSignal },
): Promise<ExecuteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, init as RequestInit);
    const text = await res.text();
    let body: ApiEnvelope | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as ApiEnvelope;
      } catch {
        body = null;
      }
    }
    return { httpStatus: res.status, body };
  } catch (error) {
    const timedOut = (error as Error)?.name === 'AbortError';
    throw new ApiError(
      timedOut
        ? 'The request timed out. Please try again.'
        : 'Network unreachable. Check your connection.',
      undefined,
      'network',
    );
  } finally {
    clearTimeout(timer);
  }
}

export type ApiResponse<T> = {
  status: number;
  data: T;
  meta?: unknown;
};

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  auth = true,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // FormData must set its own multipart boundary, so Content-Type is left to
  // fetch for uploads instead of being forced to JSON.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const rawUrl = `${API_BASE_URL}${safePath}`;
  const init: RequestInit & { signal?: AbortSignal } = {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  };

  let result: ExecuteResult;
  try {
    result = await execute(rawUrl, init);
  } catch (error) {
    if (isNetworkError(error)) {
      await sleep(300);
      result = await execute(rawUrl, init);
    } else {
      throw error;
    }
  }

  const { httpStatus, body: json } = result;
  // A 401 alone does not mean the session died: the backend also returns it
  // for ordinary authorization failures. Only a token that is actually past its
  // own `exp` may clear the session, otherwise a single forbidden call would
  // sign the user out moments after a successful sign-in.
  if (httpStatus === 401 && auth && (await isAccessTokenExpired())) {
    await dropExpiredSession();
    throw new ApiError(json?.message ?? 'Your session has expired. Please sign in again.', 401);
  }
  if (json && json.success === false) {
    throw new ApiError(json.message ?? 'Request failed', httpStatus);
  }
  if (httpStatus >= 400) {
    throw new ApiError(json?.message ?? `Request failed (${httpStatus})`, httpStatus);
  }
  return {
    status: httpStatus,
    data: (json?.data ?? {}) as T,
    meta: json?.meta,
  };
}

export const httpGet = <T = unknown>(path: string, auth = true) =>
  request<T>(path, 'GET', undefined, auth);
export const httpPost = <T = unknown>(path: string, body?: unknown, auth = true) =>
  request<T>(path, 'POST', body, auth);
export const httpPatch = <T = unknown>(path: string, body?: unknown, auth = true) =>
  request<T>(path, 'PATCH', body, auth);
export const httpDelete = <T = unknown>(path: string, auth = true) =>
  request<T>(path, 'DELETE', undefined, auth);

/**
 * Multipart upload helper. `body` is forwarded as-is so fetch can set the
 * multipart boundary; never pass a plain object here.
 */
export const httpUpload = <T = unknown>(
  path: string,
  body: FormData,
  method: 'POST' | 'PATCH' = 'POST',
  auth = true,
) => request<T>(path, method, body, auth);
