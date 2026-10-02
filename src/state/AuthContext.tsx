import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types/domain';
import { authApi, RIDER_PROFILE, CURRENT_USER, DEMO_DATA_ENABLED } from '../services/api';

type AuthState = {
  user: User | null;
  hydrated: boolean;
  isRider: boolean;
  setUser: (user: User | null) => Promise<void>;
  switchToRider: () => Promise<void>;
  switchToCustomer: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    authApi
      .getSession()
      .then((session) => setUserState(session))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setUser = useCallback(async (next: User | null) => {
    setUserState(next);
    if (next) {
      await authApi.saveUser(next);
    } else {
      await authApi.logout();
    }
  }, []);

  // The role-switch actions are demo affordances only. In release builds they
  // must not be able to install a fabricated session that the backend has never
  // issued a token for.
  const switchToRider = useCallback(async () => {
    if (!DEMO_DATA_ENABLED) return;
    setUserState(RIDER_PROFILE);
    await authApi.saveUser(RIDER_PROFILE);
  }, []);

  const switchToCustomer = useCallback(async () => {
    if (!DEMO_DATA_ENABLED) return;
    setUserState(CURRENT_USER);
    await authApi.saveUser(CURRENT_USER);
  }, []);

  const logout = useCallback(async () => {
    setUserState(null);
    await authApi.logout();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, hydrated, isRider: user?.role === 'rider', setUser, switchToRider, switchToCustomer, logout }),
    [user, hydrated, setUser, switchToRider, switchToCustomer, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}