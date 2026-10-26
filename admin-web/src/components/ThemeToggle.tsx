import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import type { ThemeMode } from '../lib/theme'

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
]

/**
 * Switches the panel between light, dark and "follow the system".
 *
 * The choice is remembered; until the admin picks one, the panel follows the
 * operating system.
 */
export default function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode)
  const theme = useThemeStore((state) => state.theme)
  const setMode = useThemeStore((state) => state.setMode)

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const Icon = mode === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  const label =
    mode === 'system'
      ? `Theme: follows the system (${theme}). Change theme`
      : `Theme: ${mode}. Change theme`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted shadow-sm transition hover:border-ink/20 hover:text-ink"
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        {mode === 'system' && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
        >
          <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Appearance
          </p>
          {OPTIONS.map((option) => {
            const OptionIcon = option.icon
            const active = mode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setMode(option.mode)
                  setOpen(false)
                }}
                className={[
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                  active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-muted',
                ].join(' ')}
              >
                <OptionIcon className="h-4 w-4" aria-hidden="true" />
                {option.label}
                {active && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
