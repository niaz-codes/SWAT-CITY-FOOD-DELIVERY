import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCheck,
  LifeBuoy,
  MessageSquare,
  Search,
  Send,
  Sparkles,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import { useAuthStore } from '../stores/authStore'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import Drawer from '../components/ui/Drawer'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError, Skeleton } from '../components/ui/States'

interface TicketRow {
  _id: string
  subject: string
  description?: string | null
  category?: string | null
  status: string
  priority?: string | null
  createdAt: string
  updatedAt?: string | null
  resolvedAt?: string | null
  user?: { _id?: string; name?: string; phone?: string; email?: string } | null
  messages?: { from?: string | null; text?: string | null; at?: string | null }[]
}

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']

/** Support tickets: read the thread, reply, and move the status. */
export default function Support() {
  const adminId = useAuthStore((state) => state.user?.id)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const list = useListResource<TicketRow>({
    endpoint: '/admin/support',
    rowsKey: 'tickets',
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [nextStatus, setNextStatus] = useState('open')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)

  const loadTicket = useCallback(async (id: string) => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/admin/support/${id}`)
      const data = (response.data?.data?.ticket ?? null) as TicketRow | null
      setTicket(data)
      setNextStatus(data?.status ?? 'open')
      setPriority(data?.priority ?? 'medium')
      setReply('')
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Could not load this ticket.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const openTicket = (row: TicketRow) => {
    setSelectedId(row._id)
    setTicket(null)
    void loadTicket(row._id)
  }

  const applyStatus = (value: string) => {
    setStatus(value)
    list.setFilter('status', value)
  }

  const save = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await api.patch(`/admin/support/${selectedId}`, {
        status: nextStatus,
        priority,
        ...(reply.trim() ? { reply: reply.trim() } : {}),
      })
      toast.success(reply.trim() ? 'Reply sent and ticket updated' : 'Ticket updated')
      await list.reload()
      await loadTicket(selectedId)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not update this ticket.'))
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return list.rows
    return list.rows.filter(
      (row) =>
        row.subject?.toLowerCase().includes(needle) ||
        row.user?.name?.toLowerCase().includes(needle) ||
        row.user?.phone?.toLowerCase().includes(needle) ||
        row.category?.toLowerCase().includes(needle),
    )
  }, [list.rows, search])

  const columns: Column<TicketRow>[] = [
    {
      key: 'ticket',
      label: 'Ticket',
      sortable: true,
      sortValue: (row) => new Date(row.updatedAt ?? row.createdAt).getTime(),
      render: (row) => (
        <div className="max-w-[380px]">
          <div className="truncate font-semibold text-ink">{row.subject}</div>
          <div className="truncate text-xs text-ink-subtle">
            {row.category || 'General'} · updated {timeAgo(row.updatedAt ?? row.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'Customer',
      render: (row) => (
        <div>
          <div className="text-ink">{row.user?.name || '-'}</div>
          {row.user?.phone && <div className="text-xs text-ink-subtle">{row.user.phone}</div>}
        </div>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (row) => (
        <Badge
          tone={
            row.priority === 'urgent' || row.priority === 'high'
              ? 'danger'
              : row.priority === 'low'
                ? 'neutral'
                : 'warning'
          }
        >
          {humanizeStatus(row.priority ?? 'medium')}
        </Badge>
      ),
    },
    {
      key: 'messages',
      label: 'Messages',
      secondary: true,
      align: 'right',
      render: (row) => row.messages?.length ?? 0,
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
    {
      key: 'created',
      label: 'Opened',
      align: 'right',
      render: (row) => (
        <span title={formatDateTime(row.createdAt)} className="text-xs">
          {timeAgo(row.createdAt)}
        </span>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Engagement"
        title="Support"
        description="Customer questions, one thread each — reply and close them without leaving the panel."
        actions={
          <Button variant="secondary" icon={LifeBuoy} onClick={() => void list.reload()}>
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter this page…"
              icon={Search}
              aria-label="Filter tickets on this page"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => applyStatus(event.target.value)}
              aria-label="Filter tickets by status"
              options={[
                { value: 'all', label: 'All statuses' },
                ...STATUSES.map((value) => ({ value, label: humanizeStatus(value) })),
              ]}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} tickets
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={list.loading}
          error={list.error}
          emptyTitle="No tickets match"
          emptyDescription="Try another status; the queue is clear otherwise."
          emptyIcon={LifeBuoy}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={openTicket}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="tickets"
        />
      </Card>

      <Drawer
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null)
          setTicket(null)
        }}
        title={ticket?.subject || 'Ticket'}
        description={
          ticket
            ? `${ticket.user?.name || 'Customer'} · opened ${formatDateTime(ticket.createdAt)}`
            : 'Loading ticket…'
        }
        width="lg"
      >
        {loading && !ticket ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <InlineError message={error} />
        ) : ticket ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(ticket.status)} dot>
                {humanizeStatus(ticket.status)}
              </Badge>
              <Badge tone="neutral">{humanizeStatus(ticket.priority ?? 'medium')} priority</Badge>
              {ticket.category && <Badge tone="info">{ticket.category}</Badge>}
            </div>

            <div className="rounded-xl border border-line bg-surface-muted/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                Original message
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {ticket.description || 'No description provided.'}
              </p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Thread
              </p>
              {(ticket.messages ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
                  No replies yet. Answer below and the customer gets a notification.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(ticket.messages ?? []).map((message, index) => {
                    const fromAdmin = Boolean(adminId) && message.from === adminId
                    const fromCustomer =
                      Boolean(ticket.user?._id) && message.from === ticket.user?._id
                    return (
                      <li
                        key={index}
                        className={[
                          'rounded-xl border px-3 py-2.5 text-sm',
                          fromAdmin
                            ? 'ml-6 border-brand/25 bg-brand-soft/60 text-ink'
                            : 'mr-6 border-line bg-surface-muted/60 text-ink',
                        ].join(' ')}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-ink-subtle">
                          <span>
                            {fromAdmin ? 'Support' : fromCustomer ? ticket.user?.name : 'Participant'}
                          </span>
                          <span>{message.at ? formatDateTime(message.at) : ''}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line p-3">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" /> Reply & update
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Status" htmlFor="ticket-status">
                  <Select
                    id="ticket-status"
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                    options={STATUSES.map((value) => ({ value, label: humanizeStatus(value) }))}
                  />
                </Field>
                <Field label="Priority" htmlFor="ticket-priority">
                  <Select
                    id="ticket-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    options={PRIORITIES.map((value) => ({ value, label: humanizeStatus(value) }))}
                  />
                </Field>
              </div>
              <Field
                label="Reply"
                htmlFor="ticket-reply"
                className="mt-3"
                hint="Leave empty to only change the status or priority."
              >
                <Textarea
                  id="ticket-reply"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Tell the customer what you found and what happens next…"
                />
              </Field>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CheckCheck}
                  disabled={nextStatus === 'resolved'}
                  onClick={() => setNextStatus('resolved')}
                >
                  Mark resolved
                </Button>
                <Button
                  variant="primary"
                  icon={Send}
                  loading={saving}
                  onClick={() => void save()}
                >
                  Send & save
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-ink-subtle">
              Last updated {formatDateTime(ticket.updatedAt ?? ticket.createdAt)}
              {ticket.resolvedAt ? ` · resolved ${formatDateTime(ticket.resolvedAt)}` : ''}
            </p>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
