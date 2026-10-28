import { Link } from 'react-router-dom'
import { CreditCard, ExternalLink } from 'lucide-react'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface PaymentRow {
  _id: string
  kind?: string | null
  method?: string | null
  status?: string | null
  amount?: number
  currency?: string | null
  gateway?: string | null
  transactionRef?: string | null
  paidAt?: string | null
  createdAt: string
  user?: { _id?: string; name?: string; phone?: string } | null
  order?: { _id?: string; orderNumber?: string; total?: number; paymentStatus?: string } | null
}

const STATUSES = ['paid', 'pending', 'failed', 'refunded', 'cancelled']
const METHODS = ['cash', 'wallet', 'easypaisa', 'jazzcash', 'card', 'demo']

/** Amber pill for simulated money — never styled like a real charge. */
function DemoBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
      title="Simulated payment for testing. No real money was transferred."
    >
      Demo — not real money
    </span>
  )
}

/** Every payment attempt, with the method and the gateway answer. */
export default function Payments() {
  const list = useListResource<PaymentRow>({
    endpoint: '/admin/payments',
    rowsKey: 'payments',
  })

  const columns: Column<PaymentRow>[] = [
    {
      key: 'payment',
      label: 'Payment',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div>
          <div className="font-semibold text-ink">{humanizeStatus(row.kind ?? 'payment')}</div>
          <div className="text-xs text-ink-subtle" title={formatDateTime(row.createdAt)}>
            {timeAgo(row.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'Account',
      render: (row) => (
        <div>
          <div className="text-ink">{row.user?.name || '-'}</div>
          {row.user?.phone && <div className="text-xs text-ink-subtle">{row.user.phone}</div>}
        </div>
      ),
    },
    {
      key: 'order',
      label: 'Order',
      render: (row) =>
        row.order?.orderNumber ? (
          <Link
            to="/orders"
            className="font-mono text-[11px] font-semibold text-brand hover:underline"
            title={`Order ${row.order.orderNumber} (total ${formatCurrency(row.order.total ?? 0)})`}
          >
            {row.order.orderNumber}
          </Link>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
            {humanizeStatus(row.method ?? '-')}
          </span>
          {row.method === 'demo' && <DemoBadge />}
        </span>
      ),
    },
    {
      key: 'gateway',
      label: 'Gateway',
      secondary: true,
      render: (row) => row.gateway || '—',
    },
    {
      key: 'reference',
      label: 'Reference',
      secondary: true,
      render: (row) =>
        row.transactionRef ? (
          <span className="font-mono text-[11px]">{row.transactionRef}</span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.amount ?? 0,
      render: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.amount ?? 0)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {humanizeStatus(row.status ?? 'pending')}
        </Badge>
      ),
    },
    {
      key: 'paidAt',
      label: 'Paid',
      secondary: true,
      align: 'right',
      render: (row) => (row.paidAt ? formatDateTime(row.paidAt) : '—'),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description="Every payment the platform took, the method it used and what the gateway answered."
        actions={
          <Button variant="secondary" icon={CreditCard} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-44">
            <Select
              value={list.filterValues.status ?? 'all'}
              onChange={(event) => list.setFilter('status', event.target.value)}
              aria-label="Filter payments by status"
              options={[
                { value: 'all', label: 'All statuses' },
                ...STATUSES.map((value) => ({ value, label: humanizeStatus(value) })),
              ]}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={list.filterValues.method ?? 'all'}
              onChange={(event) => list.setFilter('method', event.target.value)}
              aria-label="Filter payments by method"
              options={[
                { value: 'all', label: 'All methods' },
                ...METHODS.map((value) => ({ value, label: humanizeStatus(value) })),
              ]}
            />
          </div>
          <p className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} payments ·{' '}
            <Link to="/wallets" className="font-semibold text-brand hover:underline">
              open the wallet ledger <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </PageHeader>

      <Card>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No payments match"
          emptyDescription="Change the filters, or wait for the next order."
          emptyIcon={CreditCard}
          onRetry={list.reload}
          rowKey={(row) => row._id}
        />
        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="payments"
        />
      </Card>
    </div>
  )
}
