import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Centralized API client for the Swat City backend.
 *
 * Base URL is resolved from EXPO_PUBLIC_API_URL (set it to your LAN IP or a
 * production host). The default targets the Android emulator's host loopback.
 * Configure via backend/.env on your machine and .env in the mobile root.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000/api').replace(/\/+$/, '');

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

async function execute(rawUrl: string, init: RequestInit & { signal?: AbortSignal }): Promise<ExecuteResult> {
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
      timedOut ? 'The request timed out. Please try again.' : 'Network unreachable. Check your connection.',
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
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const rawUrl = `${API_BASE_URL}${safePath}`;
  const init: RequestInit & { signal?: AbortSignal } = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

export const httpGet = <T = unknown>(path: string, auth = true) => request<T>(path, 'GET', undefined, auth);
export const httpPost = <T = unknown>(path: string, body?: unknown, auth = true) => request<T>(path, 'POST', body, auth);
export const httpPatch = <T = unknown>(path: string, body?: unknown, auth = true) => request<T>(path, 'PATCH', body, auth);
export const httpDelete = <T = unknown>(path: string, auth = true) => request<T>(path, 'DELETE', undefined, auth);