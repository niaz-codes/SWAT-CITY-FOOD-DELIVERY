import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Skeleton } from './States'

export type StatTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const TONES: Record<StatTone, string> = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  success: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-muted text-ink-muted',
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: StatTone
  loading?: boolean
  /** A real percentage change, when one can be computed. */
  trend?: number | null
  to?: string
}

/**
 * A KPI tile. The trend arrow only appears when a real change is passed in -
 * the panel never invents a number to look good.
 */
export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  loading = false,
  trend,
  to,
}: StatCardProps) {
  const body = (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-ink">{value}</p>
          )}
          {(hint || typeof trend === 'number') && !loading && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {typeof trend === 'number' && (
                <span
                  className={[
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                    trend > 0
                      ? 'bg-positive-soft text-positive'
                      : trend < 0
                        ? 'bg-danger-soft text-danger'
                        : 'bg-surface-muted text-ink-muted',
                  ].join(' ')}
                >
                  {trend > 0 ? (
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  ) : trend < 0 ? (
                    <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  )}
                  {Math.abs(trend)}%
                </span>
              )}
              {hint && <span className="truncate text-ink-subtle">{hint}</span>}
            </div>
          )}
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}
        >
          <Icon className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} aria-hidden="true" />
        </span>
      </div>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block rounded-2xl focus-visible:outline-none">
        {body}
      </Link>
    )
  }
  return body
}
