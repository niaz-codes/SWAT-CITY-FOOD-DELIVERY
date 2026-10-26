import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types/domain';
import { authApi } from '../services/api';
import { isAccessTokenExpired, onSessionExpired, refreshAccessToken } from '../services/client';

type AuthState = {
  user: User | null;
  hydrated: boolean;
  isRider: boolean;
  setUser: (user: User | null) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await authApi.getSession();
        if (!session) return;
        // Only restore a session that is actually usable. The backend hands
        // out short-lived access tokens, so an expired one is first swapped
        // for a fresh pair via its refresh token; only when that fails too is
        // the session dropped, exactly as before.
        if (await isAccessTokenExpired()) {
          const refreshed = await refreshAccessToken();
          if (!refreshed) {
            await authApi.logout();
            if (!cancelled) setUserState(null);
            return;
          }
        }
        if (!cancelled) setUserState(session);
      } catch {
        // A malformed store should behave like no session at all.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from any request means the stored token died mid-session. Clearing
  // the user here routes to Login through the root session guard.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUserState(null);
      }),
    [],
  );

  const setUser = useCallback(async (next: User | null) => {
    setUserState(next);
    if (next) {
      await authApi.saveUser(next);
    } else {
      await authApi.logout();
    }
  }, []);



  const logout = useCallback(async () => {
    setUserState(null);
    await authApi.logout();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      hydrated,
      isRider: user?.role === 'rider',
      setUser,
      logout,
    }),
    [user, hydrated, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
