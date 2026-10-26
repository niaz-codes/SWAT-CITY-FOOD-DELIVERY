import { create } from 'zustand'
import { api } from '../lib/api'

/**
 * The account as the API returns it (`publicUser` on the backend).
 *
 * The panel signs in through the same API as the mobile app, so it never
 * talks to Supabase directly and never sees the password column.
 */
export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  status: string
}

/**
 * Roles this web app serves.
 *
 *   `admin`       - the full control panel (ordering, riders, payouts...)
 *   `restaurant`  - a restaurant owner: only the /portal/* pages
 *
 * Anything else (customer, rider) is a mobile-only role and is rejected even
 * before a token is stored - the panel never shows customer data at all.
 */
export const PANEL_ROLES = ['admin', 'restaurant'] as const

export function isPanelRole(role: string | undefined): boolean {
  return (PANEL_ROLES as readonly string[]).includes(role ?? '')
}

/** The page a role lands on right after signing in. */
export function homeForRole(role: string | undefined): string {
  return role === 'restaurant' ? '/portal/orders' : '/dashboard'
}

/** Step 1 of a login: the backend answers with a challenge, not a session. */
export interface LoginChallenge {
  challengeToken: string
  email: string
  ttlSeconds: number
  /**
   * When the panel received the challenge. The backend does not send it - the
   * panel stamps it - and it is what lets the code screen show how much of the
   * code's life is left, even after a refresh.
   */
  issuedAt?: number
}

interface AuthState {
  user: AdminUser | null
  loading: boolean
  /**
   * The half-finished login: the code has been emailed, the code still has to
   * come back. Kept in storage so a refresh (or a slow connection that times
   * out) does not throw the admin back to a form that looks like nothing
   * happened.
   */
  challenge: LoginChallenge | null
  /** Step 1: check the password and have the backend email a code. */
  startLogin: (email: string, password: string) => Promise<LoginChallenge>
  /** Step 2: confirm the emailed code and receive the session. */
  verifyOtp: (challengeToken: string, otp: string) => Promise<void>
  /**
   * Ask the backend for a fresh code for a challenge that is still valid.
   * Answers with the refreshed challenge, because the backend signs a new
   * challenge token with a new lifetime.
   */
  resendOtp: (challengeToken: string) => Promise<LoginChallenge>
  /** Abandon the half-finished login and go back to the email + password step. */
  clearChallenge: () => void
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const CHALLENGE_KEY = 'otpChallenge'

/** How long a code is valid, when the API does not say. */
const DEFAULT_TTL_SECONDS = 300


/** The API wraps every response in `{ success, data }`. */
function unwrap<T>(payload: { data?: T } & T): T {
  const body = payload as { data?: T }
  return (body?.data ?? payload) as T
}

/**
 * Stores the session and keeps only an account this panel serves.
 *
 * The role is checked here AND on every route (the backend enforces it), so a
 * customer or rider account can never use the panel even if this check were
 * bypassed. Admins and restaurant owners get different pages; that split is
 * ProtectedRoute's job, not this one's.
 */
function persistSession(user: AdminUser, accessToken: string, refreshToken: string): void {
  if (!isPanelRole(user.role)) {
    throw new Error('Access denied. Admin or restaurant owners only.')
  }
  if (user.status === 'suspended') {
    throw new Error('Account suspended')
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

/** Reads back the half-finished login, if the browser still has it. */
function readStoredChallenge(): LoginChallenge | null {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LoginChallenge
    return parsed?.challengeToken ? parsed : null
  } catch {
    return null
  }
}

/** Stamps a challenge with the moment it reached the panel. */
function stampChallenge(challenge: LoginChallenge): LoginChallenge {
  return { ...challenge, issuedAt: Date.now() }
}

function storeChallenge(challenge: LoginChallenge): void {
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge))
  } catch {
    // A browser that refuses storage still works - the challenge simply does
    // not survive a refresh.
  }
}

function clearStoredChallenge(): void {
  try {
    localStorage.removeItem(CHALLENGE_KEY)
  } catch {
    // Nothing to do: storage is already unavailable.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  challenge: readStoredChallenge(),

  startLogin: async (email: string, password: string) => {
    const response = await api.post('/auth/login/email', { email, password })
    const challenge = unwrap<LoginChallenge>(response.data)
    if (!challenge?.challengeToken) {
      throw new Error('Login failed')
    }
    const stamped = stampChallenge(challenge)
    storeChallenge(stamped)
    set({ challenge: stamped })
    return stamped
  },

  verifyOtp: async (challengeToken: string, otp: string) => {
    const response = await api.post('/auth/otp/email/verify', { challengeToken, otp })
    const result = unwrap<{ user: AdminUser; accessToken: string; refreshToken: string }>(
      response.data,
    )
    persistSession(result.user, result.accessToken, result.refreshToken)
    clearStoredChallenge()
    set({ user: result.user, challenge: null })
  },

  resendOtp: async (challengeToken: string) => {
    const response = await api.post('/auth/otp/email/resend', { challengeToken })
    const body = unwrap<Partial<LoginChallenge>>(response.data)
    const previous = get().challenge
    // The backend signs a new challenge token for the resent code, with a
    // fresh lifetime - keeping it means the code screen keeps counting down
    // from the right moment.
    const stamped = stampChallenge({
      challengeToken: body?.challengeToken || challengeToken,
      email: body?.email || previous?.email || '',
      ttlSeconds: body?.ttlSeconds ?? previous?.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    })
    storeChallenge(stamped)
    set({ challenge: stamped })
    return stamped
  },

  clearChallenge: () => {
    clearStoredChallenge()
    set({ challenge: null })
  },

  logout: async () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    clearStoredChallenge()
    set({ user: null, challenge: null })
  },

  checkAuth: async () => {
    try {
      if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
        set({ user: null, loading: false })
        return
      }
      const response = await api.get('/auth/me')
      const user = unwrap<AdminUser>(response.data)
      if (!isPanelRole(user?.role) || user?.status === 'suspended') {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        set({ user: null, loading: false })
        return
      }
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
}))
