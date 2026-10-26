import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  Play,
  Search,
  XCircle,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import Drawer from '../components/ui/Drawer'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError, Skeleton } from '../components/ui/States'

interface WithdrawalRow {
  _id: string
  reference: string
  amount: number
  availableBalance?: number
  destinationType?: string | null
  destination?: string | null
  destinationHolder?: string | null
  status: string
  payoutReference?: string | null
  rejectReason?: string | null
  note?: string | null
  createdAt: string
  rider?: { _id?: string; name?: string; phone?: string; email?: string } | null
}

interface WithdrawalDetail {
  withdrawal?: WithdrawalRow
  wallet?: { balance?: number; holdsEarnings?: boolean } | null
  transactions?: {
    _id: string
    type: string
    amount: number
    balanceAfter: number
    description?: string | null
    createdAt: string
  }[]
}

type ActionKind = 'approve' | 'process' | 'reject' | 'pay'

const STATUSES = ['pending', 'approved', 'processing', 'paid', 'rejected', 'cancelled']

const ACTION_COPY: Record<
  ActionKind,
  { title: string; confirm: string; tone: 'primary' | 'danger'; message: string }
> = {
  approve: {
    title: 'Approve this withdrawal?',
    confirm: 'Approve',
    tone: 'primary',
    message:
      'Approving confirms the request is valid. The money is already reserved from the rider’s wallet.',
  },
  process: {
    title: 'Start processing this payout?',
    confirm: 'Start processing',
    tone: 'primary',
    message:
      'Move the request to processing while you send the money through Easypaisa or the bank.',
  },
  reject: {
    title: 'Reject this withdrawal?',
    confirm: 'Reject and refund',
    tone: 'danger',
    message:
      'The reserved amount is released back into the rider’s available wallet immediately, and the rider is told why.',
  },
  pay: {
    title: 'Mark this payout paid?',
    confirm: 'Mark paid',
    tone: 'primary',
    message:
      'Only do this after the money has actually left. Record the transfer reference for the audit trail.',
  },
}

/** Rider payout requests and the four states an admin moves them through. */
export default function Withdrawals() {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const list = useListResource<WithdrawalRow>({
    endpoint: '/admin/withdrawals',
    rowsKey: 'withdrawals',
    searchParam: 'search',
  })

  const [action, setAction] = useState<{ kind: ActionKind; row: WithdrawalRow } | null>(null)
  const [reason, setReason] = useState('')
  const [payoutReference, setPayoutReference] = useState('')
  const [busy, setBusy] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WithdrawalDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    try {
      const response = await api.get(`/admin/withdrawals/${id}`)
      setDetail((response.data?.data ?? {}) as WithdrawalDetail)
    } catch (failure) {
      setDetailError(apiErrorMessage(failure, 'Could not load this payout.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDetail = (row: WithdrawalRow) => {
    setSelectedId(row._id)
    setDetail(null)
    void loadDetail(row._id)
  }

  const closeAction = () => {
    setAction(null)
    setReason('')
    setPayoutReference('')
  }

  const run = async () => {
    if (!action) return
    const { kind, row } = action
    if (kind === 'reject' && !reason.trim()) {
      toast.error('A reason is required when rejecting a payout.')
      return
    }
    if (kind === 'pay' && payoutReference.trim().length < 3) {
      toast.error('Enter the transfer reference (at least 3 characters).')
      return
    }
    setBusy(true)
    try {
      if (kind === 'approve') await api.post(`/admin/withdrawals/${row._id}/approve`)
      if (kind === 'process') await api.post(`/admin/withdrawals/${row._id}/process`)
      if (kind === 'reject')
        await api.post(`/admin/withdrawals/${row._id}/reject`, { reason: reason.trim() })
      if (kind === 'pay')
        await api.post(`/admin/withdrawals/${row._id}/pay`, {
          payoutReference: payoutReference.trim(),
        })

      toast.success(
        kind === 'approve'
          ? 'Payout approved'
          : kind === 'process'
            ? 'Payout moved to processing'
            : kind === 'reject'
              ? 'Payout rejected and refunded'
              : 'Payout marked paid',
      )
      closeAction()
      await list.reload()
      if (selectedId) await loadDetail(selectedId)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not update this payout.'))
    } finally {
      setBusy(false)
    }
  }

  const actionItems = (row: WithdrawalRow) => {
    const items: Parameters<typeof Dropdown>[0]['items'] = []
    if (row.status === 'pending') {
      items.push(
        { label: 'Approve', icon: CheckCircle2, onClick: () => setAction({ kind: 'approve', row }) },
        {
          label: 'Reject',
          icon: XCircle,
          danger: true,
          onClick: () => setAction({ kind: 'reject', row }),
        },
      )
    }
    if (row.status === 'approved') {
      items.push({
        label: 'Start processing',
        icon: Play,
        onClick: () => setAction({ kind: 'process', row }),
      })
    }
    if (row.status === 'processing') {
      items.push(
        {
          label: 'Mark paid',
          icon: Banknote,
          onClick: () => setAction({ kind: 'pay', row }),
        },
        {
          label: 'Reject',
          icon: XCircle,
          danger: true,
          divider: true,
          onClick: () => setAction({ kind: 'reject', row }),
        },
      )
    }
    items.push({ label: 'View details', icon: ArrowRight, onClick: () => openDetail(row) })
    return items
  }

  const columns: Column<WithdrawalRow>[] = [
    {
      key: 'request',
      label: 'Request',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div>
          <div className="font-mono text-xs font-semibold text-ink">{row.reference}</div>
          <div className="text-xs text-ink-subtle" title={formatDateTime(row.createdAt)}>
            {timeAgo(row.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'rider',
      label: 'Rider',
      render: (row) => (
        <div>
          <div className="text-ink">{row.rider?.name || '-'}</div>
          {row.rider?.phone && <div className="text-xs text-ink-subtle">{row.rider.phone}</div>}
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.amount ?? 0,
      render: (row) => <span className="font-semibold text-ink">{formatCurrency(row.amount)}</span>,
    },
    {
      key: 'destination',
      label: 'Destination',
      render: (row) => (
        <div className="text-xs">
          <div className="text-ink">
            {humanizeStatus(row.destinationType ?? 'easypaisa')} · {row.destinationHolder || '—'}
          </div>
          <div className="font-mono text-ink-subtle">{row.destination || '—'}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {humanizeStatus(row.status)}
        </Badge>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Withdrawals"
        description="Rider payouts move pending → approved → processing → paid. Rejecting refunds the reserved amount."
        actions={
          <Button variant="secondary" icon={ArrowDownToLine} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-64">
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                list.setSearch(event.target.value)
              }}
              placeholder="Search reference, rider or amount"
              icon={Search}
              aria-label="Search withdrawals"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                list.setFilter('status', event.target.value)
              }}
              aria-label="Filter withdrawals by status"
              options={[
                { value: 'all', label: 'All statuses' },
                ...STATUSES.map((value) => ({ value, label: humanizeStatus(value) })),
              ]}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} requests
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No withdrawal requests"
          emptyDescription="Rider payout requests appear here the moment they are made."
          emptyIcon={ArrowDownToLine}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={openDetail}
          actions={(row) => <Dropdown items={actionItems(row)} />}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="withdrawals"
        />
      </Card>

      {/* Approve / process confirmations */}
      <ConfirmDialog
        open={Boolean(action && (action.kind === 'approve' || action.kind === 'process'))}
        onClose={closeAction}
        onConfirm={() => void run()}
        title={action ? ACTION_COPY[action.kind].title : ''}
        message={
          action ? (
            <div className="space-y-2">
              <p>{ACTION_COPY[action.kind].message}</p>
              <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Rider</span>
                  <span className="font-semibold text-ink">{action.row.rider?.name || '—'}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-ink-muted">Amount</span>
                  <span className="font-semibold text-ink">{formatCurrency(action.row.amount)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-ink-muted">Reference</span>
                  <span className="font-mono text-ink">{action.row.reference}</span>
                </div>
              </div>
            </div>
          ) : null
        }
        confirmLabel={action ? ACTION_COPY[action.kind].confirm : 'Confirm'}
        tone={action ? ACTION_COPY[action.kind].tone : 'primary'}
        busy={busy}
      />

      {/* Reject */}
      <ConfirmDialog
        open={action?.kind === 'reject'}
        onClose={closeAction}
        onConfirm={() => void run()}
        title="Reject this withdrawal?"
        message="The reserved amount is released back into the rider's wallet and the rider receives a notification with your reason."
        confirmLabel="Reject and refund"
        busy={busy}
      >
        <Field label="Reason" htmlFor="withdrawal-reason" required>
          <Textarea
            id="withdrawal-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Account number does not match the rider's name"
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      {/* Pay */}
      <Modal
        open={action?.kind === 'pay'}
        onClose={closeAction}
        title="Mark this payout paid"
        description="Record the real transfer reference. This is the proof the money left."
        size="sm"
        busy={busy}
        footer={
          <>
            <Button variant="secondary" onClick={closeAction} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void run()}>
              Mark paid
            </Button>
          </>
        }
      >
        {action && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-muted">Paying</span>
                <span className="font-semibold text-ink">{action.row.rider?.name || '—'}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-ink-muted">Amount</span>
                <span className="font-semibold text-ink">{formatCurrency(action.row.amount)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-ink-muted">To</span>
                <span className="font-mono text-ink">
                  {action.row.destinationType} · {action.row.destination}
                </span>
              </div>
            </div>
            <Field
              label="Transfer reference / TID"
              htmlFor="payout-reference"
              required
              hint="From the Easypaisa or bank receipt."
            >
              <Input
                id="payout-reference"
                value={payoutReference}
                onChange={(event) => setPayoutReference(event.target.value)}
                placeholder="e.g. EP-8842190"
                maxLength={120}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Detail */}
      <Drawer
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
        }}
        title={detail?.withdrawal?.reference || 'Withdrawal'}
        description={
          detail?.withdrawal
            ? `${formatCurrency(detail.withdrawal.amount)} · ${humanizeStatus(
                detail.withdrawal.status,
              )}`
            : 'Loading payout…'
        }
      >
        {detailLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detailError ? (
          <InlineError message={detailError} />
        ) : detail?.withdrawal ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(detail.withdrawal.status)} dot>
                {humanizeStatus(detail.withdrawal.status)}
              </Badge>
              <Badge tone="neutral">{humanizeStatus(detail.withdrawal.destinationType ?? '')}</Badge>
            </div>

            <dl className="divide-y divide-line rounded-xl border border-line text-sm">
              {[
                ['Rider', detail.withdrawal.rider?.name || '—'],
                ['Phone', detail.withdrawal.rider?.phone || '—'],
                ['Amount', formatCurrency(detail.withdrawal.amount)],
                ['Account holder', detail.withdrawal.destinationHolder || '—'],
                ['Account / number', detail.withdrawal.destination || '—'],
                [
                  'Balance before request',
                  formatCurrency(detail.withdrawal.availableBalance ?? 0),
                ],
                ['Wallet now', formatCurrency(detail.wallet?.balance ?? 0)],
                ['Payout reference', detail.withdrawal.payoutReference || '—'],
                ['Reject reason', detail.withdrawal.rejectReason || '—'],
                ['Requested', formatDateTime(detail.withdrawal.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="text-right text-xs font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Recent wallet activity
              </p>
              {(detail.transactions ?? []).length === 0 ? (
                <p className="text-xs text-ink-muted">No transactions recorded.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {(detail.transactions ?? []).map((transaction) => (
                    <li
                      key={transaction._id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {humanizeStatus(transaction.type)}
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {transaction.description || formatDateTime(transaction.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-ink">
                        {formatCurrency(transaction.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
