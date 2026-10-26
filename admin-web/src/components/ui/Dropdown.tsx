import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  /** Draws a divider above this item. */
  divider?: boolean
}

interface DropdownProps {
  items: MenuItem[]
  /** Custom trigger content. Defaults to a "more" icon button. */
  trigger?: ReactNode
  label?: string
  align?: 'left' | 'right'
}

/** A small action menu used for per-row operations. */
export default function Dropdown({
  items,
  trigger,
  label = 'Open actions',
  align = 'right',
}: DropdownProps) {
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

  if (items.length === 0) return null

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="menu"
          className={[
            'absolute z-40 mt-1 w-52 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {items.map((item, index) => {
            const Icon = item.icon
            return (
              <div key={`${item.label}-${index}`}>
                {item.divider && index > 0 && <div className="my-1 h-px bg-line" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpen(false)
                    item.onClick()
                  }}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                    item.danger
                      ? 'text-danger hover:bg-danger-soft'
                      : 'text-ink hover:bg-surface-muted',
                  ].join(' ')}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {item.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
