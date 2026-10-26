/**
 * Theme persistence and application.
 *
 * The theme lives in a class on <html> (the inline script in index.html applies
 * it before the first paint) and the choice is remembered in local storage. The
 * preference can also be "system", which follows the operating system until the
 * admin picks a fixed theme.
 *
 * Nothing here talks to the API - it is purely presentational.
 */

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

const STORAGE_KEY = 'admin-theme'

function canUseStorage(): boolean {
  try {
    const probe = '__swat_theme_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The theme that is on screen right now. */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** The preference the admin picked earlier, if there is one. */
export function storedMode(): ThemeMode | null {
  if (!canUseStorage()) return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : null
  } catch {
    return null
  }
}

export function resolveMode(mode: ThemeMode): Theme {
  return mode === 'system' ? systemTheme() : mode
}

/**
 * Switches the theme on screen and updates the browser chrome.
 *
 * `theme-color` is what a phone paints its address bar with, so it has to move
 * with the theme or a dark panel sits under a white bar.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070b10' : '#f6f8f8')
}

/** Remembers the preference for the next visit. */
export function saveMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // A browser that refuses storage still shows the theme, it just forgets it.
  }
}

export { STORAGE_KEY }
