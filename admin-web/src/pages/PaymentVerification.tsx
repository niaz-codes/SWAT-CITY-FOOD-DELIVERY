import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  BadgeCheck,
  ExternalLink,
  FileQuestion,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import type { BadgeTone } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Field, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Drawer from '../components/ui/Drawer'
import Pagination from '../components/ui/Pagination'
import Tabs from '../components/ui/Tabs'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError, Skeleton } from '../components/ui/States'

interface VerificationRow {
  _id: string
  method?: string | null
  status?: string | null
  gateway?: string | null
  amount?: number
  currency?: string | null
  transactionRef?: string | null
  verifyAttempts?: number
  createdAt: string
  user?: { _id?: string; name?: string; phone?: string } | null
  order?: {
    _id?: string
    orderNumber?: string
    total?: number
    paymentStatus?: string
    status?: string
  } | null
  metadata?: {
    channel?: string
    submittedAt?: string
    receiptMimetype?: string
    receiptSizeBytes?: number
    resubmitCount?: number
  } | null
}

interface VerificationAuditEntry {
  id: string
  decision: string
  actor?: string
  actorRole?: string
  reason?: string | null
  createdAt: string
}

interface VerificationDetail {
  payment?: {
    id: string
    method?: string
    channel?: string
    status?: string
    amount?: number
    currency?: string
    transactionRef?: string | null
    submittedAt?: string | null
    receiptUrl?: string | null
    failureReason?: string | null
    verifyAttempts?: number
    submitCount?: number
  }
  order?: {
    id?: string
    orderNumber?: string
    status?: string
    paymentStatus?: string
    total?: number
    createdAt?: string
  }
  customer?: { id?: string; name?: string; phone?: string }
  audit?: VerificationAuditEntry[]
}

type DecisionKind = 'approve' | 'reject' | 'request_info'

/** The status tabs map one-to-one onto the API's `status` query values. */
const STATUS_TABS = [
  { value: '', label: 'All active' },
  { value: 'pending_verification', label: 'Awaiting verification' },
  { value: 'paid', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: '__all', label: 'All' },
]

const STATUS_COPY: Record<string, { label: string; tone: BadgeTone }> = {
  pending_verification: { label: 'Awaiting verification', tone: 'warning' },
  pending: { label: 'Pending', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'neutral' },
  paid: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

function statusCopy(status?: string | null): { label: string; tone: BadgeTone } {
  const value = (status ?? '').toLowerCase()
  return (
    STATUS_COPY[value] ?? {
      label: humanizeStatus(status ?? '-'),
      tone: 'neutral',
    }
  )
}

/** Brand-ish chips for the three manual channels. */
const METHOD_META: Record<string, { label: string; chip: string }> = {
  ubl: {
    label: 'UBL Bank',
    chip: 'bg-[#0B7A3B]/10 text-[#0B7A3B] ring-1 ring-inset ring-[#0B7A3B]/30',
  },
  easypaisa_transfer: {
    label: 'Easypaisa',
    chip: 'bg-[#3BAE49]/10 text-[#3BAE49] ring-1 ring-inset ring-[#3BAE49]/30',
  },
  jazzcash_transfer: {
    label: 'JazzCash',
    chip: 'bg-[#EE1C25]/10 text-[#EE1C25] ring-1 ring-inset ring-[#EE1C25]/25',
  },
}

function MethodChip({ value }: { value?: string | null }) {
  const meta = METHOD_META[(value ?? '').toLowerCase()]
  if (!meta) return <Badge tone="neutral">{humanizeStatus(value ?? '-')}</Badge>
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.chip}`}
    >
      {meta.label}
    </span>
  )
}

const AUDIT_COPY: Record<string, { label: string; tone: BadgeTone }> = {
  receipt_submitted: { label: 'Receipt submitted', tone: 'info' },
  approve: { label: 'Approved', tone: 'success' },
  reject: { label: 'Rejected', tone: 'danger' },
  request_info: { label: 'Info requested', tone: 'warning' },
}

function auditCopy(decision?: string): { label: string; tone: BadgeTone } {
  return (
    AUDIT_COPY[(decision ?? '').toLowerCase()] ?? {
      label: humanizeStatus(decision ?? '-'),
      tone: 'neutral',
    }
  )
}

/**
 * Direct Bank Transfer verification: UBL plus manual Easypaisa/JazzCash
 * receipts that must be checked against the real bank statement before the
 * order is marked as paid and accepted.
 */
export default function PaymentVerification() {
  const list = useListResource<VerificationRow>({
    endpoint: '/admin/payments/verification',
    rowsKey: 'payments',
  })

  const [statusTab, setStatusTab] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VerificationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [receiptBroken, setReceiptBroken] = useState(false)
  const [receiptBusy, setReceiptBusy] = useState(false)

  const [action, setAction] = useState<DecisionKind | null>(null)
  // The note a verifier may attach to an approval, or the reason a
  // reject / request_info decision carries (the API requires >= 4 chars).
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setReceiptBroken(false)
    try {
      const response = await api.get(`/admin/payments/verification/${id}`)
      const verification = response.data?.data?.verification as VerificationDetail | undefined
      if (!verification) {
        setDetail(null)
        setDetailError('This payment could not be loaded.')
      } else {
        setDetail(verification)
      }
    } catch (failure) {
      setDetailError(apiErrorMessage(failure, 'Could not load this payment.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDetail = (row: VerificationRow) => {
    setSelectedId(row._id)
    setDetail(null)
    setDetailError('')
    void loadDetail(row._id)
  }

  const closeDetail = () => {
    setSelectedId(null)
    setDetail(null)
    setDetailError('')
  }

  const openAction = (kind: DecisionKind) => {
    setAction(kind)
    setReason('')
  }

  const closeAction = () => {
    setAction(null)
    setReason('')
  }

  const run = async () => {
    if (!selectedId || !action) return
    if (action !== 'approve' && reason.trim().length < 4) {
      toast.error('Give a reason of at least 4 characters.')
      return
    }
    setBusy(true)
    try {
      await api.post(`/admin/payments/verification/${selectedId}/decision`, {
        decision: action,
        reason: reason.trim() || undefined,
      })
      toast.success(
        action === 'approve'
          ? 'Payment verified — the order can be accepted'
          : action === 'reject'
            ? 'Payment rejected'
            : 'Asked the customer for a new receipt',
      )
      closeAction()
      await list.reload()
      await loadDetail(selectedId)
    } catch (failure) {
      // A double submission (or an already-decided payment) is a 409 — the
      // server message is shown, then the detail is pulled again so the
      // drawer reflects the state someone else just changed.
      toast.error(apiErrorMessage(failure, 'Could not record the decision.'))
      void loadDetail(selectedId)
    } finally {
      setBusy(false)
    }
  }

  /** A fresh signed URL for the receipt, after the short-lived one 404s. */
  const refreshReceipt = async () => {
    if (!selectedId) return
    setReceiptBusy(true)
    try {
      const response = await api.get(`/admin/payments/verification/${selectedId}/receipt`)
      const url = (response.data?.data as { url?: string } | undefined)?.url
      if (!url) throw new Error('Received no receipt link from the server.')
      setDetail((current) =>
        current?.payment ? { ...current, payment: { ...current.payment, receiptUrl: url } } : current,
      )
      setReceiptBroken(false)
      toast.success('Receipt link refreshed.')
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not fetch a fresh receipt link.'))
    } finally {
      setReceiptBusy(false)
    }
  }

  const columns: Column<VerificationRow>[] = [
    {
      key: 'order',
      label: 'Order',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div>
          <div className="font-mono text-xs font-semibold text-ink">
            {row.order?.orderNumber || '—'}
          </div>
          <div className="text-xs text-ink-subtle" title={formatDateTime(row.createdAt)}>
            {timeAgo(row.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row) => (
        <div>
          <div className="text-ink">{row.user?.name || '-'}</div>
          {row.user?.phone && <div className="text-xs text-ink-subtle">{row.user.phone}</div>}
        </div>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (row) => <MethodChip value={row.method ?? row.metadata?.channel} />,
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
      sortValue: (row) => row.order?.total ?? row.amount ?? 0,
      render: (row) => (
        <span className="font-semibold text-ink">
          {formatCurrency(row.order?.total ?? row.amount ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const copy = statusCopy(row.status)
        return (
          <Badge tone={copy.tone} dot>
            {copy.label}
          </Badge>
        )
      },
    },
    {
      key: 'submissions',
      label: 'Submissions',
      secondary: true,
      align: 'right',
      render: (row) => <span>{row.verifyAttempts ?? 1}</span>,
    },
  ]

  const pending = detail?.payment?.status === 'pending_verification'
  const receiptUrl = detail?.payment?.receiptUrl

  const drawerStatus = statusCopy(detail?.payment?.status)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Transfer Verification"
        description="Direct Bank Transfers (UBL) and manual Easypaisa / JazzCash receipts. Verify each one against the real account statement before the order is accepted."
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Tabs
            items={STATUS_TABS}
            value={statusTab}
            onChange={(value) => {
              setStatusTab(value)
              list.setFilter('status', value)
            }}
          />
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} transfers
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No transfers to verify"
          emptyDescription="Manual bank and wallet transfers appear here the moment a customer submits a receipt."
          emptyIcon={ShieldCheck}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={openDetail}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="transfers"
        />
      </Card>

      {/* Approve confirmation */}
      <ConfirmDialog
        open={action === 'approve'}
        onClose={closeAction}
        onConfirm={() => void run()}
        title="Verify & approve this transfer?"
        confirmLabel="Verify & approve"
        tone="primary"
        busy={busy}
        message={
          'Confirm you checked this transfer against the actual UBL account/bank statement. A screenshot alone is not proof.'
        }
      >
        <Field
          label="Audit note (optional)"
          htmlFor="verification-note"
          hint="Record what convinced you, e.g. the statement number or the matched entry date."
        >
          <Textarea
            id="verification-note"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Matched UBL statement entry of 28 Oct for this reference"
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      {/* Rejection */}
      <ConfirmDialog
        open={action === 'reject'}
        onClose={closeAction}
        onConfirm={() => void run()}
        title="Reject this payment?"
        confirmLabel="Reject payment"
        tone="danger"
        busy={busy}
        message="The order stays unpaid and the customer is told why. Make the reason specific enough to act on."
      >
        <Field label="Reason" htmlFor="verification-reject-reason" required>
          <Textarea
            id="verification-reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Amount received does not match the order total"
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      {/* Request info */}
      <ConfirmDialog
        open={action === 'request_info'}
        onClose={closeAction}
        onConfirm={() => void run()}
        title="Request a new receipt?"
        confirmLabel="Request receipt"
        tone="primary"
        busy={busy}
        message="The customer is asked to submit a fresh receipt, with your reason attached."
      >
        <Field label="Reason" htmlFor="verification-info-reason" required>
          <Textarea
            id="verification-info-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Screenshot is unreadable — send a clearer image with the amount visible"
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      {/* Detail */}
      <Drawer
        open={Boolean(selectedId)}
        onClose={closeDetail}
        title={detail?.order?.orderNumber || 'Transfer verification'}
        description={
          detail?.payment
            ? `${drawerStatus.label} · ${formatCurrency(detail.payment.amount ?? 0)}`
            : 'Loading payment…'
        }
        footer={
          detail?.payment?.status === 'pending_verification' ? (
            <div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={BadgeCheck}
                  disabled={!receiptUrl}
                  onClick={() => openAction('approve')}
                >
                  Verify &amp; approve
                </Button>
                <Button
                  variant="danger"
                  icon={XCircle}
                  onClick={() => openAction('reject')}
                >
                  Reject payment
                </Button>
                <Button
                  variant="secondary"
                  icon={FileQuestion}
                  onClick={() => openAction('request_info')}
                >
                  Request new receipt
                </Button>
              </div>
              {!receiptUrl && (
                <p className="mt-2 text-[11px] text-ink-subtle">
                  A receipt is required before approving. Use “Refresh receipt link” above if the
                  image failed to load.
                </p>
              )}
            </div>
          ) : detail?.payment ? (
            <p className="text-xs text-ink-subtle">
              Only payments awaiting verification can be decided — current status:{' '}
              {drawerStatus.label.toLowerCase()}.
            </p>
          ) : undefined
        }
      >
        {detailLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : detailError ? (
          <div className="space-y-3">
            <InlineError message={detailError} />
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => selectedId && void loadDetail(selectedId)}
            >
              Try again
            </Button>
          </div>
        ) : detail?.payment ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={drawerStatus.tone} dot>
                {drawerStatus.label}
              </Badge>
              <MethodChip value={detail.payment?.method ?? detail.payment?.channel} />
            </div>

            {pending && (
              <div className="rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5 text-xs font-semibold text-brand">
                Compare against {formatCurrency(detail.order?.total ?? detail.payment?.amount ?? 0)}{' '}
                — the order total for{' '}
                <span className="font-mono">{detail.order?.orderNumber || 'this order'}</span>.
                Approve only when the reference, amount and account name all match the statement.
              </div>
            )}

            {/* Receipt preview */}
            {receiptUrl && !receiptBroken ? (
              <div className="space-y-2">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-line bg-surface-muted"
                  title="Open the full-size receipt"
                >
                  <img
                    src={receiptUrl}
                    alt={`Payment receipt for order ${detail.order?.orderNumber || ''}`}
                    className="max-h-96 w-full object-contain"
                    onError={() => setReceiptBroken(true)}
                  />
                </a>
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    Open full size <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={RefreshCw}
                    loading={receiptBusy}
                    onClick={() => void refreshReceipt()}
                  >
                    Refresh link
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {receiptUrl && receiptBroken
                    ? 'The receipt link has expired and cannot be shown.'
                    : 'No receipt on file.'}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RefreshCw}
                  loading={receiptBusy}
                  onClick={() => void refreshReceipt()}
                >
                  Refresh receipt link
                </Button>
              </div>
            )}

            <dl className="divide-y divide-line rounded-xl border border-line text-sm">
              {(
                [
                  ['Customer', detail.customer?.name || '—'],
                  ['Phone', detail.customer?.phone || '—'],
                  ['Order', detail.order?.orderNumber || '—'],
                  ['Order total', formatCurrency(detail.order?.total ?? 0)],
                  ['Order status', humanizeStatus(detail.order?.status)],
                  ['Payment status', humanizeStatus(detail.order?.paymentStatus)],
                  ['Amount claimed', formatCurrency(detail.payment?.amount ?? 0)],
                  ['Reference', detail.payment?.transactionRef || '—'],
                  [
                    'Submitted',
                    detail.payment?.submittedAt ? formatDateTime(detail.payment.submittedAt) : '—',
                  ],
                  ['Verify attempts', String(detail.payment?.verifyAttempts ?? 0)],
                  ['Resubmissions', String(detail.payment?.submitCount ?? 0)],
                  ...(detail.payment?.failureReason
                    ? ([['Failure reason', detail.payment.failureReason]] as [string, string][])
                    : []),
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="text-right text-xs font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" /> Audit trail
              </p>
              {(detail.audit ?? []).length === 0 ? (
                <p className="text-xs text-ink-muted">No entries yet.</p>
              ) : (
                <ol className="divide-y divide-line rounded-xl border border-line">
                  {(detail.audit ?? []).map((entry) => {
                    const copy = auditCopy(entry.decision)
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={copy.tone}>{copy.label}</Badge>
                            <span className="text-xs font-semibold text-ink">
                              {entry.actor || '—'}
                            </span>
                            {entry.actorRole && (
                              <span className="text-[10px] uppercase tracking-wide text-ink-subtle">
                                {entry.actorRole}
                              </span>
                            )}
                          </p>
                          {entry.reason && (
                            <p className="mt-0.5 text-xs text-ink-muted">{entry.reason}</p>
                          )}
                        </div>
                        <span
                          className="shrink-0 text-[11px] text-ink-subtle"
                          title={formatDateTime(entry.createdAt)}
                        >
                          {timeAgo(entry.createdAt)}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
