interface TabItem {
  value: string
  label: string
  count?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/** A segmented control for switching a view without leaving the page. */
export default function Tabs({ items, value, onChange, className = '' }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-muted p-1 ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              active
                ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  active ? 'bg-brand-soft text-brand' : 'bg-line/60 text-ink-muted',
                ].join(' ')}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
