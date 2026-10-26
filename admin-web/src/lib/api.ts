import axios, { type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // The login mails a code, so the API waits for the mail provider to answer.
  // That routinely takes 5-8 seconds - a short timeout would abort a login
  // that was about to succeed.
  timeout: 45000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** A request that already failed once, so it is not retried in a loop. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

/**
 * Trades the refresh token for a new access token.
 *
 * Access tokens are short lived (15 minutes). Without this the panel would
 * log the admin out every time one expired, even though the refresh token is
 * still valid for a week.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    // Plain axios on purpose: the instance would run this through the
    // interceptor again and retry forever.
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
    const result = (data?.data ?? data) as { accessToken?: string; refreshToken?: string }
    if (!result?.accessToken) return null
    localStorage.setItem('accessToken', result.accessToken)
    if (result.refreshToken) localStorage.setItem('refreshToken', result.refreshToken)
    return result.accessToken
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (status === 401 && config && !config._retried) {
      // A rejected code is also a 401, and that one has nothing to do with an
      // expired session - refreshing or redirecting would throw the admin
      // back to the start of the login they are in the middle of.
      if (!isAuthFlowRequest(config.url)) {
        config._retried = true
        const accessToken = await refreshAccessToken()
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`
          return api.request(config)
        }
      }
    }

    if (status === 401 && config && !isAuthFlowRequest(config.url)) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

/** The login steps: their 401s are answers, not expired sessions. */
function isAuthFlowRequest(url: string | undefined): boolean {
  if (!url) return false
  return [
    '/auth/login/email',
    '/auth/otp/email/verify',
    '/auth/otp/email/resend',
    '/auth/refresh',
    '/auth/me',
  ].some((path) => url.includes(path))
}

/**
 * The message to show for a failed request.
 *
 * The API answers with `{ success: false, message }`, so that message is far
 * more useful than axios' generic "Request failed with status code 4xx".
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message) return message
    if (error.code === 'ERR_NETWORK') return 'Could not reach the server. Check your connection.'
    if (error.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.'
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * The HTTP status of a failed request, or `undefined` when the request never
 * reached the server. Lets a screen tell "wrong password" (401) apart from
 * "the mail provider is cooling down" (429/502).
 */
export function apiErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) return error.response?.status
  return undefined
}

/**
 * Uploads an image as `multipart/form-data` and returns the response `data`.
 *
 * Used by the restaurant portal (profile dish and banner images) - the
 * single-file field the backend's `upload` middleware expects is named `file`.
 */
export async function uploadFile(path: string, file: File): Promise<Record<string, unknown>> {
  const formData = new FormData()
  formData.append('file', file)
  // The instance's JSON content type must be overridden, or axios would send
  // the form as a stringified body.
  const response = await api.post(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  const body = response.data as { data?: Record<string, unknown> }
  return (body?.data ?? response.data) as Record<string, unknown>
}
