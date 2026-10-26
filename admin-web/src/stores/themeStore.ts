import { create } from 'zustand'
import {
  applyTheme,
  currentTheme,
  resolveMode,
  saveMode,
  storedMode,
  systemTheme,
  type Theme,
  type ThemeMode,
} from '../lib/theme'

interface ThemeState {
  /** What the admin picked: light, dark or follow the system. */
  mode: ThemeMode
  /** What is actually on screen right now. */
  theme: Theme
  setMode: (mode: ThemeMode) => void
  /** Light <-> dark. Keeps "system" working by pinning the opposite theme. */
  toggle: () => void
}

const initialMode: ThemeMode = storedMode() ?? 'system'

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  theme: resolveMode(initialMode),

  setMode: (mode) => {
    const theme = resolveMode(mode)
    applyTheme(theme)
    saveMode(mode)
    set({ mode, theme })
  },

  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    // Toggling is an explicit choice, so it stops following the OS.
    saveMode(next)
    set({ mode: next, theme: next })
  },
}))

/**
 * Keeps "system" honest: when the OS flips while the admin has not pinned a
 * theme, the panel flips with it.
 */
export function startSystemThemeSync(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)')

  const apply = () => {
    if (useThemeStore.getState().mode !== 'system') return
    const theme = systemTheme()
    applyTheme(theme)
    useThemeStore.setState({ theme })
  }

  // Make sure the class matches the stored preference on boot.
  applyTheme(resolveMode(useThemeStore.getState().mode))

  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}

export { currentTheme }
