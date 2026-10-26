import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BellRing,
  BellOff,
  CircleCheckBig,
  ClipboardList,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  SquarePen,
  Undo2,
  Wallet,
} from 'lucide-react'
import { api, apiErrorMessage, apiErrorStatus } from '../../lib/api'
import { formatCurrency, formatDateTime, humanizeStatus, timeAgo } from '../../lib/format'
import {
  announcePendingOrders,
  freshOrderIds,
  requestAlertPermission,
  setSoundAlerts,
  soundAlertsEnabled,
} from '../../lib/orderAlert'
import type { PortalOrder } from '../../lib/portalTypes'
import { CANCELLABLE_STATUSES, RESTAURANT_ACTIONS, orderStatusLabel, orderStatusTone } from '../../lib/portalTypes'
import type { PortalContextValue } from '../../lib/portalTypes'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Input, Textarea } from '../../components/ui/Field'
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '../../components/ui/States'
import Tabs from '../../components/ui/Tabs'

/** How often the kitchen queue refreshes itself while the page is visible. */
const POLL_MS = 20_000
/** The page size the queue loads; a kitchen works its recent orders, not its year. */
const QUEUE_LIMIT = 50

interface QueueTab {
  value: string
  label: string
  statuses: string[]
}

const QUEUE_TABS: QueueTab[] = [
  { value: 'new', label: 'New', statuses: ['pending'] },
  { value: 'kitchen', label: 'In kitchen', statuses: ['confirmed', 'preparing', 'ready'] },
  { value: 'delivery', label: 'With rider', statuses: ['rider_assigned', 'picked_up', 'on_the_way'] },
  { value: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { value: 'all', label: 'All', statuses: [] },
]

/** The rider row may be an object (populated) or only an id; name when known. */
function riderName(order: PortalOrder): string | null {
  if (!order.rider) return null
  if (typeof order.rider === 'string') return null
  return order.rider.name || null
}

function riderPhone(order: PortalOrder): string | null {
  if (!order.rider) return null
  if (typeof order.rider === 'string') return null
  return order.rider.phone || null
}

/** One line of items, e.g. "2x Chicken Biryani, 1x Kabuli Pulao". */
function itemsSummary(order: PortalOrder): string {
  return (order.items ?? [])
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(', ')
}

interface DetailRow {
  label: string
  value: string
}

function OrderDetailModal({
  order,
  onClose,
}: {
  order: PortalOrder | null
  onClose: () => void
}) {
  if (!order) return null
  const rows: DetailRow[] = [
    { label: 'Payment', value: `${humanizeStatus(order.paymentMethod)} · ${humanizeStatus(order.paymentStatus)}` },
    ...(riderName(order) ? [{ label: 'Rider', value: riderName(order)! }] : []),
    ...(order.note ? [{ label: 'Customer note', value: order.note }] : []),
    ...(order.cancelReason ? [{ label: 'Cancel reason', value: order.cancelReason }] : []),
  ]

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Order ${order.orderNumber || order._id.slice(-8)}`}
      description={`${order.items.length} item${order.items.length === 1 ? '' : 's'} · placed ${formatDateTime(order.createdAt)}`}
    >
      <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Items
            </h4>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {order.items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-base">{item.emoji || '🍽️'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {item.quantity}x {item.name}
                    </span>
                    {item.note && <span className="block text-xs text-ink-muted">{item.note}</span>}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {order.addressSnapshot?.full && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Deliver to
              </h4>
              <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                {order.addressSnapshot.full}
              </p>
            </div>
          )}
          {rows.length > 0 && (
            <dl className="space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start gap-2 text-sm">
                  <dt className="w-28 shrink-0 text-ink-subtle">{row.label}</dt>
                  <dd className="text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-muted/60 p-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="text-ink">{formatCurrency(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="text-ink">{formatCurrency(order.deliveryFee)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Discount</dt>
                  <dd className="text-danger">-{formatCurrency(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatCurrency(order.total)}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Timeline
            </h4>
            <ol className="space-y-2.5">
              {(order.statusHistory ?? [])
                .filter((event) => event.status)
                .map((event, index) => (
                  <li key={`${event.status}-${index}`} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <span>
                      <span className="block font-medium text-ink">
                        {orderStatusLabel(event.status ?? '')}
                      </span>
                      <span className="block text-xs text-ink-subtle">
                        {formatDateTime(event.at ?? null)}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Reason dialog for rejecting/cancelling - the backend requires a reason. */
function CancelDialog({
  order,
  busy,
  onConfirm,
  onClose,
}: {
  order: PortalOrder | null
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  if (!order) return null
  const rejecting = order.status === 'pending'
  const invalid = reason.trim().length < 3

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={rejecting ? 'Reject this order' : 'Cancel this order'}
      description={
        rejecting
          ? 'The customer is told why their order was not accepted.'
          : 'The kitchen already accepted this order - the customer is notified of the cancel.'
      }
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())} loading={busy} disabled={invalid}>
            {rejecting ? 'Reject order' : 'Cancel order'}
          </Button>
        </>
      }
    >
      <Textarea
        rows={3}
        placeholder="e.g. Out of chicken biryani today"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
      />
      <p className="mt-2 text-xs text-ink-subtle">At least 3 characters - it goes to the customer.</p>
    </Modal>
  )
}

export default function PortalOrders() {
  const context = useOutletContext<PortalContextValue>()

  const [orders, setOrders] = useState<PortalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('new')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PortalOrder | null>(null)
  const [cancelling, setCancelling] = useState<PortalOrder | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  // Kitchen alerts: chime + desktop notification when a new pending order lands.
  const [alertsOn, setAlertsOn] = useState(soundAlertsEnabled())
  const [freshIds, setFreshIds] = useState<string[]>([])

  const requestId = useRef(0)

  const load = useCallback(async (quiet = false) => {
    const current = ++requestId.current
    if (!quiet) setLoading(true)
    try {
      const response = await api.get(`/restaurant/orders?limit=${QUEUE_LIMIT}`)
      if (current !== requestId.current) return
      const body = response.data as { data?: { orders?: PortalOrder[] } }
      const rows = body?.data?.orders ?? []
      setOrders(rows)
      setLastUpdated(new Date())
      setError('')
      // Feeding the alert engine here means the chime fires on the poll that
      // discovered the order, not on the next one.
      const pendingIds = rows.filter((order) => order.status === 'pending').map((order) => order._id)
      const { freshIds: arrived, announced } = announcePendingOrders(pendingIds)
      if (arrived.length > 0 || announced) setFreshIds(freshOrderIds())
      if (announced) {
        toast.success(`${arrived.length} new order${arrived.length === 1 ? '' : 's'} just landed`, {
          description: 'Confirm it so the kitchen can start cooking.',
        })
      }
    } catch (failure) {
      if (current !== requestId.current) return
      setError(apiErrorMessage(failure, 'Could not load your orders.'))
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [])

  /** Chime + desktop-notification opt in/out — persisted in localStorage. */
  const toggleAlerts = async () => {
    const next = !alertsOn
    setSoundAlerts(next)
    setAlertsOn(next)
    if (next) {
      await requestAlertPermission()
      toast.success('Kitchen alerts are on', {
        description: 'A chime plays and a toast pops when a new order arrives.',
      })
    } else {
      toast.success('Kitchen alerts muted', {
        description: 'The queue still refreshes every 20 s, silently.',
      })
    }
  }

  useEffect(() => {
    void load()
    // The kitchen queue should feel live: it refreshes quietly, but only while
    // the page is actually on screen.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  /** Move an order on one step (confirm / start preparing / mark ready). */
  const advanceOrder = async (order: PortalOrder) => {
    const action = RESTAURANT_ACTIONS[order.status]
    if (!action || busyId) return
    setBusyId(order._id)
    try {
      const response = await api.post(`/restaurant/orders/${order._id}/advance`, {
        status: action.next,
      })
      const body = response.data as { data?: { order?: PortalOrder } }
      if (body?.data?.order) {
        setOrders((rows) =>
          rows.map((row) => (row._id === order._id ? body.data!.order! : row)),
        )
      } else {
        void load(true)
      }
      toast.success(`${order.orderNumber || 'Order'} — ${action.label.toLowerCase()} done`)
    } catch (failure) {
      // 409 means life moved on: someone (customer or rider) already changed
      // the order - the queue refresh shows the current state instead of a
      // hypothetical one.
      if (apiErrorStatus(failure) === 409) {
        toast.error('The order already moved on. Reloading the queue…')
        void load(true)
        return
      }
      toast.error(apiErrorMessage(failure, 'Could not update the order.'))
    } finally {
      setBusyId(null)
    }
  }

  const cancelOrder = async (order: PortalOrder, reason: string) => {
    setCancelBusy(true)
    try {
      await api.post(`/restaurant/orders/${order._id}/cancel`, { reason })
      toast.success(
        `${order.orderNumber || 'Order'} ${order.status === 'pending' ? 'rejected' : 'cancelled'}`,
      )
      setCancelling(null)
      void load(true)
    } catch (failure) {
      if (apiErrorStatus(failure) === 409) {
        toast.error('The order already moved on. Reloading the queue…')
        setCancelling(null)
        void load(true)
        return
      }
      toast.error(apiErrorMessage(failure, 'Could not cancel the order.'))
    } finally {
      setCancelBusy(false)
    }
  }

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const spec of QUEUE_TABS) {
      map.set(
        spec.value,
        spec.statuses.length === 0
          ? orders.length
          : orders.filter((order) => spec.statuses.includes(order.status)).length,
      )
    }
    return map
  }, [orders])

  const visible = useMemo(() => {
    const spec = QUEUE_TABS.find((entry) => entry.value === tab) ?? QUEUE_TABS[0]
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (spec.statuses.length > 0 && !spec.statuses.includes(order.status)) return false
      if (!term) return true
      const haystack = `${order.orderNumber ?? ''} ${itemsSummary(order)} ${order._id}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [orders, tab, search])

  const stats = context.data?.stats

  return (
    <div>
      <PageHeader
        title="Orders"
        description="The live kitchen queue. Confirm new orders, cook them, and mark them ready for the rider."
        actions={
          <>
            <span className="hidden text-xs text-ink-muted lg:block">
              {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : null}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={alertsOn ? BellRing : BellOff}
              onClick={() => void toggleAlerts()}
              title={alertsOn ? 'Mute new-order alerts' : 'Turn on new-order alerts'}
            >
              {alertsOn ? 'Alerts on' : 'Muted'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => void load()}
              loading={loading}
            >
              Refresh
            </Button>
          </>
        }
      />

      {/* Today so far - the same numbers the sidebar shows. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SmallStat
          icon={ClipboardList}
          label="Pending"
          value={stats?.pendingOrders ?? 0}
          loading={!stats}
          hint="waiting for your confirm"
        />
        <SmallStat
          icon={ShoppingBag}
          label="Active"
          value={stats?.activeOrders ?? 0}
          loading={!stats}
          hint="confirmed or cooking"
        />
        <SmallStat
          icon={Undo2}
          label="Today's orders"
          value={stats?.todayOrders ?? 0}
          loading={!stats}
        />
        <SmallStat
          icon={Wallet}
          label="Today's revenue"
          value={formatCurrency(stats?.todayRevenue ?? 0)}
          loading={!stats}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={QUEUE_TABS.map((spec) => ({
            value: spec.value,
            label: spec.label,
            count: counts.get(spec.value) ?? 0,
          }))}
          value={tab}
          onChange={setTab}
        />
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            className="w-56 pl-9"
            placeholder="Order number or dish…"
            aria-label="Search orders"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing here right now"
          description={
            tab === 'new'
              ? 'When a customer orders from your menu, it appears here for you to confirm.'
              : 'No orders match this filter. Refresh to check for updates.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((order) => {
            const action = RESTAURANT_ACTIONS[order.status]
            const cancellable = CANCELLABLE_STATUSES.includes(order.status)
            const phone = riderPhone(order)
            return (
              <li
                key={order._id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-ink/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">
                        #{order.orderNumber || order._id.slice(-8)}
                      </span>
                      <Badge tone={orderStatusTone(order.status)} dot>
                        {orderStatusLabel(order.status)}
                      </Badge>
                      {freshIds.includes(order._id) && (
                        <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                          New
                        </span>
                      )}
                      <span className="text-xs text-ink-subtle">{timeAgo(order.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-ink-muted">
                      {itemsSummary(order) || 'No items'}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                        {humanizeStatus(order.paymentMethod)}
                      </span>
                      {riderName(order) && (
                        <span className="inline-flex items-center gap-1">
                          {phone && (
                            <a
                              href={`tel:${phone}`}
                              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                              aria-label={`Call rider ${riderName(order)}`}
                            >
                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                              {riderName(order)}
                            </a>
                          )}
                          {!phone && riderName(order)}
                        </span>
                      )}
                      {order.cancelReason && (
                        <span className="text-danger">Reason: {order.cancelReason}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-ink">
                      {formatCurrency(order.total)}
                    </span>
                    <Button size="sm" variant="ghost" icon={SquarePen} onClick={() => setDetail(order)}>
                      Details
                    </Button>
                    {cancellable && (
                      <Button size="sm" variant="secondary" onClick={() => setCancelling(order)}>
                        {order.status === 'pending' ? 'Reject' : 'Cancel'}
                      </Button>
                    )}
                    {action && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={CircleCheckBig}
                        loading={busyId === order._id}
                        onClick={() => void advanceOrder(order)}
                      >
                        {action.label}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <OrderDetailModal order={detail} onClose={() => setDetail(null)} />
      <CancelDialog
        order={cancelling}
        busy={cancelBusy}
        onConfirm={(reason) => {
          if (cancelling) void cancelOrder(cancelling, reason)
        }}
        onClose={() => !cancelBusy && setCancelling(null)}
      />
    </div>
  )
}

/** The compact KPI tile the portal pages share (smaller than the admin StatCard). */
function SmallStat({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: typeof ShoppingBag
  label: string
  value: string | number
  hint?: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <Spinner className="h-4 w-4" />
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}
