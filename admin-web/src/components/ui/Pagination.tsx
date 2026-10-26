import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

interface PaginationProps {
  page: number
  pages: number
  total: number
  limit: number
  onPage: (page: number) => void
  /** Noun for the row count, e.g. "orders". */
  noun?: string
}

/** Server-side paging footer shared by every list screen. */
export default function Pagination({ page, pages, total, limit, onPage, noun = 'rows' }: PaginationProps) {
  if (total === 0) return null
  const safePages = Math.max(1, pages)
  const from = (page - 1) * limit + 1
  const to = Math.min(total, page * limit)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-muted">
      <span>
        Showing <span className="font-semibold text-ink">{from}</span>–
        <span className="font-semibold text-ink">{to}</span> of{' '}
        <span className="font-semibold text-ink">{total.toLocaleString('en-PK')}</span> {noun}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          icon={ChevronLeft}
          aria-label="Previous page"
        >
          Prev
        </Button>
        <span className="px-2 font-semibold text-ink">
          {page} / {safePages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(Math.min(safePages, page + 1))}
          disabled={page >= safePages}
          iconRight={ChevronRight}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
