import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search, ShoppingBag, Users } from 'lucide-react'
import Modal from './ui/Modal'
import { ALL_NAV } from '../lib/navigation'

interface PaletteItem {
  id: string
  label: string
  hint: string
  icon: typeof Search
  action: () => void
}

/**
 * Ctrl/Cmd+K navigation. It also turns a typed number or name into an order or
 * customer search, which is what an admin on a phone call actually needs.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      window.setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    const needle = query.trim().toLowerCase()
    const pages = ALL_NAV.filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle),
    ).map<PaletteItem>((item) => ({
      id: item.to,
      label: item.name,
      hint: item.description,
      icon: item.icon,
      action: () => navigate(item.to),
    }))

    const extra: PaletteItem[] = []
    if (needle.length >= 2) {
      extra.push(
        {
          id: 'search-orders',
          label: `Search orders for “${query.trim()}”`,
          hint: 'Order number',
          icon: ShoppingBag,
          action: () => navigate(`/orders?search=${encodeURIComponent(query.trim())}`),
        },
        {
          id: 'search-customers',
          label: `Search customers for “${query.trim()}”`,
          hint: 'Name, phone or email',
          icon: Users,
          action: () => navigate(`/customers?search=${encodeURIComponent(query.trim())}`),
        },
      )
    }

    return [...pages, ...extra]
  }, [query, navigate])

  // Keep the highlight inside the list as it shrinks.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  const run = (item: PaletteItem | undefined) => {
    if (!item) return
    item.action()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Jump to" size="md">
      <div className="-mt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((current) => Math.min(items.length - 1, current + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current) => Math.max(0, current - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                run(items[active])
              }
            }}
            placeholder="Search pages, orders or customers..."
            aria-label="Search pages, orders or customers"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
        </div>

        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto" role="listbox">
          {items.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-muted">
              Nothing matches “{query}”.
            </li>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(item)}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                      index === active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span
                        className={[
                          'block truncate text-xs',
                          index === active ? 'text-brand/80' : 'text-ink-subtle',
                        ].join(' ')}
                      >
                        {item.hint}
                      </span>
                    </span>
                    {index === active && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-subtle">
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono">↑</kbd>{' '}
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono">↓</kbd>{' '}
          to move ·{' '}
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono">
            Enter
          </kbd>{' '}
          to open ·{' '}
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono">
            Esc
          </kbd>{' '}
          to close
        </p>
      </div>
    </Modal>
  )
}
