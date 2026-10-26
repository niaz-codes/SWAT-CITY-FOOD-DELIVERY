import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, Megaphone, Send, Users } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError } from '../components/ui/States'

interface BroadcastRow {
  _id: string
  title: string
  body?: string | null
  audience?: string | null
  status?: string | null
  recipients?: number
  pushed?: number
  createdAt: string
}

const AUDIENCES = [
  { value: 'all', label: 'Everyone in the app' },
  { value: 'customers', label: 'Customers only' },
  { value: 'riders', label: 'Riders only' },
]

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone',
  customers: 'Customers',
  riders: 'Riders',
}

const TITLE_LIMIT = 80
const BODY_LIMIT = 300

/** Compose a push/in-app broadcast and read the real send history. */
export default function Notifications() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [historyAudience, setHistoryAudience] = useState('all')

  const list = useListResource<BroadcastRow>({
    endpoint: '/admin/notifications',
    rowsKey: 'notifications',
  })

  const validate = (): boolean => {
    if (title.trim().length < 1) {
      setError('Add a title — it becomes the push notification heading.')
      return false
    }
    if (body.trim().length < 1) {
      setError('Add a message for the notification body.')
      return false
    }
    setError('')
    return true
  }

  const send = async () => {
    setSending(true)
    try {
      const response = await api.post('/admin/notifications', {
        title: title.trim(),
        body: body.trim(),
        audience,
      })
      const recipients = response.data?.data?.recipients ?? 0
      const pushed = response.data?.data?.pushed ?? 0
      toast.success(
        `Broadcast sent to ${recipients.toLocaleString('en-PK')} inboxes · ${pushed.toLocaleString(
          'en-PK',
        )} devices pushed`,
      )
      setConfirmOpen(false)
      setTitle('')
      setBody('')
      setAudience('all')
      setHistoryAudience('all')
      list.setFilter('audience', 'all')
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not send the broadcast.'))
    } finally {
      setSending(false)
    }
  }

  const columns: Column<BroadcastRow>[] = [
    {
      key: 'message',
      label: 'Message',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div className="max-w-[420px]">
          <div className="font-semibold text-ink">{row.title}</div>
          <div className="line-clamp-2 text-xs text-ink-muted">{row.body || '—'}</div>
        </div>
      ),
    },
    {
      key: 'audience',
      label: 'Audience',
      render: (row) => (
        <Badge tone="brand">{AUDIENCE_LABELS[row.audience ?? 'all'] ?? row.audience}</Badge>
      ),
    },
    {
      key: 'recipients',
      label: 'Inboxes',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.recipients ?? 0,
      render: (row) => (row.recipients ?? 0).toLocaleString('en-PK'),
    },
    {
      key: 'pushed',
      label: 'Pushed',
      align: 'right',
      secondary: true,
      render: (row) => (row.pushed ?? 0).toLocaleString('en-PK'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {humanizeStatus(row.status ?? 'sent')}
        </Badge>
      ),
    },
    {
      key: 'sent',
      label: 'Sent',
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
        title="Notifications"
        description="Send one message to customers, riders or everyone — it lands in the in-app inbox and as a push."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="New broadcast"
            description="This is sent immediately. There is no way to unsend it."
            icon={<Megaphone className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody className="space-y-4">
            <Field
              label="Title"
              htmlFor="broadcast-title"
              required
              hint={`${title.length}/${TITLE_LIMIT} characters`}
            >
              <Input
                id="broadcast-title"
                value={title}
                maxLength={TITLE_LIMIT}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Eid Mubarak from Swat City"
              />
            </Field>

            <Field
              label="Message"
              htmlFor="broadcast-body"
              required
              hint={`${body.length}/${BODY_LIMIT} characters`}
            >
              <Textarea
                id="broadcast-body"
                value={body}
                maxLength={BODY_LIMIT}
                rows={4}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Order your favourite food today and enjoy free delivery over Rs 800."
              />
            </Field>

            <Field label="Audience" htmlFor="broadcast-audience">
              <Select
                id="broadcast-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                options={AUDIENCES}
              />
            </Field>

            {error && <InlineError message={error} />}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              <p className="text-xs text-ink-subtle">
                <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Everyone means every active customer and rider account.
              </p>
              <Button
                variant="primary"
                icon={Send}
                disabled={!title.trim() || !body.trim()}
                onClick={() => {
                  if (validate()) setConfirmOpen(true)
                }}
              >
                Review & send
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Preview"
            description="How the push reads on a phone"
            icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-strong p-3 shadow-card">
              <div className="rounded-xl bg-white/95 p-3 text-slate-900 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-700 text-[10px] font-bold text-white">
                    SC
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Swat City · now
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">{title.trim() || 'Your title here'}</p>
                <p className="mt-0.5 line-clamp-3 text-xs text-slate-600">
                  {body.trim() || 'Your message appears here, exactly as the customer will read it.'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
              The push may be truncated by the phone. Keep the first sentence useful and put the
              offer up front.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Send history</h2>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                value={historyAudience}
                onChange={(event) => {
                  setHistoryAudience(event.target.value)
                  list.setFilter('audience', event.target.value)
                }}
                aria-label="Filter broadcasts by audience"
                options={[
                  { value: 'all', label: 'All audiences' },
                  { value: 'customers', label: 'Customers' },
                  { value: 'riders', label: 'Riders' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            </div>
            <Button variant="secondary" icon={Bell} onClick={() => void list.reload()}>
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <DataTable
            columns={columns}
            rows={list.rows}
            loading={list.loading}
            error={list.error}
            emptyTitle="Nothing sent yet"
            emptyDescription="Your first broadcast will appear here with its delivery counts."
            emptyIcon={Bell}
            onRetry={list.reload}
            rowKey={(row) => row._id}
          />
          <Pagination
            page={list.page}
            pages={list.pages}
            total={list.total}
            limit={list.limit}
            onPage={list.setPage}
            noun="broadcasts"
          />
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void send()}
        title="Send this broadcast now?"
        message={
          <div className="space-y-2">
            <p>
              This goes to <strong>{AUDIENCE_LABELS[audience] ?? audience}</strong> immediately. It
              cannot be edited or recalled after sending.
            </p>
            <div className="rounded-xl border border-line bg-surface-muted p-3">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1 text-xs text-ink-muted">{body}</p>
            </div>
          </div>
        }
        confirmLabel="Send broadcast"
        tone="primary"
        busy={sending}
      />
    </div>
  )
}
