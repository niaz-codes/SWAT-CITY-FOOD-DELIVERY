import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Centralized API client for the Swat City Food Delivery backend.
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

/**
 * Timeout for ordinary JSON requests. These are small and the server answers
 * from a warm database, so a short budget keeps a dead network from leaving the
 * UI spinning.
 */
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Timeout for multipart uploads.
 *
 * The timeout covers the *whole* request, including the time spent pushing the
 * bytes upstream — not just waiting for a response. Rider sign-up sends a camera
 * capture, which is routinely 1.5-4MB even at `quality: 0.7`, so the 12s that
 * suits a JSON call aborted healthy registrations mid-upload on a mobile
 * connection and surfaced as "The request timed out" / "Network unreachable".
 * 60s gives a ~4MB photo roughly 60KB/s of headroom, which is slow-but-real for
 * a 3G/4G link in Swat. The server-side multer limit is 5MB, so a body that
 * fits that cap will still finish well inside this budget.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Timeout for the authentication calls.
 *
 * These are the slowest endpoints in the app: the backend hands the 6-digit
 * code to Supabase Auth and waits for the provider to accept the mail, which
 * regularly takes 5-8 seconds on a mobile connection. The ordinary JSON budget
 * of 12s was too tight for that and aborted healthy sign-ins with "the request
 * timed out" - on a slow link the mail still arrived, so the user was told the
 * login failed while a code sat in their inbox.
 */
export const AUTH_TIMEOUT_MS = 30_000;

export type ApiTokens = {
  accessToken: string;
  refreshToken: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ApiError extends Error {
  readonly status?: number;
  readonly kind: 'http' | 'network' | 'timeout';

  constructor(message: string, status?: number, kind: 'http' | 'network' | 'timeout' = 'http') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** True when the request never reached the server (connection refused, DNS, offline). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'network';
}

/** True when the request was cut short by the client's own deadline. */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'timeout';
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

// ---------------------------------------------------------------------------
// Silent token refresh
// ---------------------------------------------------------------------------

/** Milliseconds before `exp` at which a token counts as "about to die". */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** 401 on these cleanup endpoints must never trigger another refresh call. */
const REFRESH_PATH = '/auth/refresh';

let refreshInFlight: Promise<ApiTokens | null> | null = null;

/**
 * Exchanges the stored refresh token for a fresh session token pair.
 *
 * Concurrent callers share one in-flight request, so five screens hitting 401
 * at the same moment produce exactly one `/auth/refresh` call. Returns null
 * when there is no refresh token or the backend rejects it (rotated out,
 * suspended, logged in elsewhere). Clearing the stored tokens is the caller's
 * decision.
 */
export async function refreshAccessToken(): Promise<ApiTokens | null> {
  const stored = await getApiTokens();
  if (!stored?.refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const result: ExecuteResult = await execute(`${API_BASE_URL}${REFRESH_PATH}`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: stored.refreshToken }),
        });
        const data = result.body as { data?: { accessToken?: string; refreshToken?: string } } | null;
        const accessToken = data?.data?.accessToken;
        const refreshToken = data?.data?.refreshToken ?? stored.refreshToken;
        if (result.httpStatus !== 200 || !accessToken) return null;
        const tokens: ApiTokens = { accessToken, refreshToken };
        await setApiTokens(tokens);
        return tokens;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function tokenExpiresWithin(token: string, marginMs: number): boolean {
  const exp = jwtExpiryMs(token);
  return exp !== null && Date.now() >= exp - marginMs;
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
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<ExecuteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The signal has to be handed to fetch, otherwise the deadline above never
    // reaches the network stack and a stalled request spins forever with the
    // button in its loading state. Every call therefore ends in a definite
    // answer: a response, a timeout, or a connection failure.
    const res = await fetch(rawUrl, { ...init, signal: controller.signal } as RequestInit);
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
    const name = (error as Error)?.name;
    const message = (error as Error)?.message ?? '';
    const timedOut = name === 'AbortError' || /abort/i.test(message);
    throw new ApiError(
      timedOut
        ? 'The request timed out. Please check your connection and try again.'
        : 'Network unreachable. Check your connection.',
      undefined,
      timedOut ? 'timeout' : 'network',
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
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // FormData must set its own multipart boundary, so Content-Type is left to
  // fetch for uploads instead of being forced to JSON.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  const isRefreshPath = path.startsWith(REFRESH_PATH);

  if (auth) {
    const token = await getAccessToken();
    if (token) {
      // Proactive refresh: when the token is inside its last minute, swap it
      // first so the in-flight request does not have to die with a 401.
      if (tokenExpiresWithin(token, TOKEN_REFRESH_MARGIN_MS)) {
        const refreshed = await refreshAccessToken();
        headers.Authorization = `Bearer ${refreshed?.accessToken ?? token}`;
      } else {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const rawUrl = `${API_BASE_URL}${safePath}`;
  const makeInit = (extraHeaders?: Record<string, string>): RequestInit & { signal?: AbortSignal } => ({
    method,
    headers: extraHeaders ? { ...headers, ...extraHeaders } : headers,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  let result: ExecuteResult;
  try {
    result = await execute(rawUrl, makeInit(), timeoutMs);
  } catch (error) {
    // Only a connection that failed before anything moved is worth repeating.
    // A timeout means the request was already on the wire - resending would
    // double the bytes on an already-slow link and land on the same deadline.
    // Uploads are never repeated: the photo may be partway upstream already.
    const retryable = !isFormData && isNetworkError(error);
    if (retryable) {
      await sleep(300);
      result = await execute(rawUrl, makeInit(), timeoutMs);
    } else {
      throw error;
    }
  }

  let { httpStatus, body: json } = result;

  // A 401 does not always mean the session died: the backend also returns it
  // for ordinary authorization failures. Try a silent refresh first; the
  // session is only dropped when the refresh itself cannot mint a token AND
  // the current access token is already past its own `exp`.
  if (httpStatus === 401 && auth && !isRefreshPath) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      result = await execute(rawUrl, makeInit({ Authorization: `Bearer ${refreshed.accessToken}` }), timeoutMs);
      httpStatus = result.httpStatus;
      json = result.body;
    }
    if (httpStatus === 401) {
      if (await isAccessTokenExpired()) {
        await dropExpiredSession();
      }
      throw new ApiError(json?.message ?? 'Your session has expired. Please sign in again.', 401);
    }
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

export const httpGet = <T = unknown>(path: string, auth = true, timeoutMs?: number) =>
  request<T>(path, 'GET', undefined, auth, timeoutMs ?? REQUEST_TIMEOUT_MS);
export const httpPost = <T = unknown>(path: string, body?: unknown, auth = true, timeoutMs?: number) =>
  request<T>(path, 'POST', body, auth, timeoutMs ?? REQUEST_TIMEOUT_MS);
export const httpPatch = <T = unknown>(path: string, body?: unknown, auth = true, timeoutMs?: number) =>
  request<T>(path, 'PATCH', body, auth, timeoutMs ?? REQUEST_TIMEOUT_MS);
export const httpDelete = <T = unknown>(path: string, auth = true, timeoutMs?: number) =>
  request<T>(path, 'DELETE', undefined, auth, timeoutMs ?? REQUEST_TIMEOUT_MS);

/**
 * Multipart upload helper. `body` is forwarded as-is so fetch can set the
 * multipart boundary; never pass a plain object here.
 *
 * Uses the longer upload budget: a camera photo can take far more than the JSON
 * timeout to reach the server on a mobile connection.
 */
export const httpUpload = <T = unknown>(
  path: string,
  body: FormData,
  method: 'POST' | 'PATCH' = 'POST',
  auth = true,
) => request<T>(path, method, body, auth, UPLOAD_TIMEOUT_MS);

/**
 * Same contract as `httpUpload`, but reports upload progress and is backed by
 * XMLHttpRequest because fetch has no upload-progress event.
 *
 * The request is deliberately NEVER retried: a half-uploaded photo may have
 * already reached the server, and replaying the multipart body would double the
 * bytes on an already-slow link. Callers surface a retry action instead.
 */
export function httpUploadWithProgress<T = unknown>(
  path: string,
  body: FormData,
  onProgress?: (percent: number) => void,
  method: 'POST' | 'PATCH' = 'POST',
  auth = true,
): Promise<ApiResponse<T>> {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${safePath}`;

  return new Promise<ApiResponse<T>>((resolve, reject) => {
    void (async () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (auth) {
        const token = await getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const xhr = new XMLHttpRequest();
      let settled = false;
      const fail = (error: ApiError) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      xhr.open(method, url);
      // No Content-Type here: XHR must add its own multipart boundary.
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
        onProgress?.(percent);
      };

      xhr.onload = () => {
        if (settled) return;
        let json: { success?: boolean; message?: string; data?: unknown; meta?: unknown } | null =
          null;
        try {
          json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          json = null;
        }
        if (json && json.success === false) {
          fail(new ApiError(json.message ?? 'Request failed', xhr.status));
          return;
        }
        if (xhr.status >= 400) {
          fail(new ApiError(json?.message ?? `Request failed (${xhr.status})`, xhr.status));
          return;
        }
        settled = true;
        resolve({
          status: xhr.status,
          data: (json?.data ?? {}) as T,
          meta: json?.meta as ApiResponse<T>['meta'],
        });
      };

      xhr.onerror = () =>
        fail(new ApiError('Network request failed. Check your connection.', undefined, 'network'));
      xhr.ontimeout = () =>
        fail(new ApiError('The upload timed out. Please try again.', undefined, 'timeout'));
      xhr.onabort = () => fail(new ApiError('The upload was cancelled.', undefined, 'network'));

      xhr.send(body);
    })().catch((error) => reject(error));
  });
}
