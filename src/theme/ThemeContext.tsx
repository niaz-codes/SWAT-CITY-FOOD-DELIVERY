import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ColorScheme } from './colors';

type Scheme = 'light' | 'dark';
const THEME_KEY = '@swat/theme-mode';

type ThemeContextValue = {
  scheme: Scheme;
  dark: boolean;
  colors: ColorScheme;
  setScheme: (scheme: Scheme) => Promise<void>;
  toggle: () => Promise<void>;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setMode] = useState<Scheme | 'system'>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setMode(stored);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const scheme: Scheme = mode === 'system' ? system : mode;

  const setScheme = useCallback(async (next: Scheme) => {
    setMode(next);
    try {
      await AsyncStorage.setItem(THEME_KEY, next);
    } catch {}
  }, []);

  const toggle = useCallback(async () => {
    setMode((prev) => {
      const resolved: Scheme = prev === 'system' ? system : prev;
      const next: Scheme = resolved === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  }, [system]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      dark: scheme === 'dark',
      colors: scheme === 'dark' ? darkColors : lightColors,
      setScheme,
      toggle,
      hydrated,
    }),
    [scheme, setScheme, toggle, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return ctx;
}

export function useThemeColors() {
  return useAppTheme();
}
