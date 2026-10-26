import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState, ErrorState, TableSkeleton } from './ui/States'

export interface Column<T> {
  /** Stable key for the column. */
  key: string
  label: string
  /** The cell content. */
  render: (row: T) => ReactNode
  /** Extra classes for the cell (alignment, width). */
  className?: string
  align?: 'left' | 'right' | 'center'
  /** Allows the admin to sort the current page by this column. */
  sortable?: boolean
  sortValue?: (row: T) => string | number
  /** Hidden in the small card layout (used for secondary numbers). */
  secondary?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  loading: boolean
  error: string
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  emptyAction?: ReactNode
  onRetry?: () => void
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** Rendered in a dedicated trailing cell, outside the data columns. */
  actions?: (row: T) => ReactNode
  loadingRows?: number
}

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/**
 * A table that also works on a phone.
 *
 * On a wide screen the rows are a table; on a narrow one every row becomes a
 * card, because a sideways-scrolling table is unusable on a handset.
 */
export default function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRetry,
  rowKey,
  onRowClick,
  actions,
  loadingRows = 8,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const column = columns.find((entry) => entry.key === sortKey)
    if (!column?.sortValue) return rows
    const read = column.sortValue
    return [...rows].sort((a, b) => {
      const left = read(a)
      const right = read(b)
      if (typeof left === 'number' && typeof right === 'number') {
        return direction === 'asc' ? left - right : right - left
      }
      return direction === 'asc'
        ? String(left).localeCompare(String(right))
        : String(right).localeCompare(String(left))
    })
  }, [rows, columns, sortKey, direction])

  const toggleSort = (column: Column<T>) => {
    if (!column.sortable || !column.sortValue) return
    if (sortKey === column.key) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column.key)
      setDirection('asc')
    }
  }

  if (loading) {
    return (
      <>
        <div className="hidden lg:block">
          <TableSkeleton rows={loadingRows} columns={Math.min(6, columns.length + 1)} />
        </div>
        <div className="divide-y divide-line lg:hidden" role="status" aria-label="Loading">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 px-4 py-4">
              <div className="skeleton h-3.5 w-1/2" />
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          ))}
        </div>
      </>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <>
      {/* Wide screens: a real table. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={[
                      'sticky top-0 z-10 border-b border-line bg-surface-muted/95 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle backdrop-blur',
                      ALIGN[column.align ?? 'left'],
                      column.className ?? '',
                    ].join(' ')}
                  >
                    {column.sortable && column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={[
                          'inline-flex items-center gap-1 rounded transition hover:text-ink',
                          column.align === 'right' ? 'flex-row-reverse' : '',
                        ].join(' ')}
                      >
                        {column.label}
                        {active ? (
                          direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                )
              })}
              {actions && <th scope="col" className="w-12 border-b border-line bg-surface-muted/95" />}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  'group transition-colors',
                  onRowClick ? 'cursor-pointer' : '',
                  'hover:bg-surface-muted/70',
                ].join(' ')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      'border-b border-line/70 px-4 py-3 text-sm text-ink-muted',
                      ALIGN[column.align ?? 'left'],
                      column.className ?? '',
                    ].join(' ')}
                  >
                    {column.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="border-b border-line/70 px-2 py-3 text-right">
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per row. */}
      <ul className="divide-y divide-line lg:hidden">
        {sortedRows.map((row) => {
          const [title, ...rest] = columns
          return (
            <li
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[
                'px-4 py-3.5 transition-colors',
                onRowClick ? 'cursor-pointer active:bg-surface-muted' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm font-semibold text-ink">{title?.render(row)}</div>
                {actions && <div className="-mr-1 shrink-0">{actions(row)}</div>}
              </div>
              <dl className="mt-2 space-y-1.5">
                {rest
                  .filter((column) => !column.secondary)
                  .map((column) => (
                    <div key={column.key} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-xs text-ink-subtle">{column.label}</dt>
                      <dd className="text-right text-xs font-medium text-ink">{column.render(row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          )
        })}
      </ul>
    </>
  )
}
