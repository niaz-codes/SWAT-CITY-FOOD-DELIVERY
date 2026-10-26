import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Ban,
  Bike,
  CheckCircle2,
  MapPin,
  Package,
  Phone,
  Search,
  ShoppingBag,
  User,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import {
  formatCurrency,
  formatDateTime,
  humanizeStatus,
  statusTone,
  timeAgo,
} from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Drawer from '../components/ui/Drawer'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { EmptyState, InlineError, Skeleton } from '../components/ui/States'

interface OrderRow {
  _id: string
  orderNumber?: string | null
  status: string
  total: number
  paymentMethod?: string | null
  paymentStatus?: string | null
  createdAt: string
  customer?: { name?: string; phone?: string } | null
  restaurant?: { name?: string; emoji?: string | null } | null
  rider?: { name?: string; phone?: string } | null
  items?: { name?: string; quantity?: number; price?: number; emoji?: string | null }[]
}

interface OrderDetail extends OrderRow {
  subtotal?: number
  deliveryFee?: number
  discount?: number
  platformFee?: number
  riderPayout?: number
  distanceKm?: number
  estimatedMinutes?: number
  addressSnapshot?: {
    full?: string
    area?: string | null
    tag?: string | null
    lat?: number | null
    lng?: number | null
  } | null
  statusHistory?: { status?: string | null; note?: string | null; at?: string | null }[]
  cancelReason?: string | null
  paymentGateway?: string | null
  paymentTransactionRef?: string | null
  customer?: { name?: string; phone?: string; email?: string } | null
  restaurant?: { name?: string; emoji?: string | null; phone?: string | null; addressLine?: string | null; area?: string | null } | null
}

interface RiderOption {
  _id: string
  name: string
  phone?: string | null
  status?: string | null
  isOnline?: boolean
  vehiclePlate?: string | null
  user?: { _id?: string; id?: string; phone?: string } | null
}

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
]

/** Mirrors backend/src/services/order.service.ts ORDER_FLOW. */
const ORDER_FLOW: Record<string, string[]> = {
  pending: ['confirmed'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['rider_assigned'],
  rider_assigned: ['picked_up'],
  picked_up: ['on_the_way'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
}

const CLOSED = ['delivered', 'cancelled']

/** Every food order, with the actions an admin actually needs. */
export default function Orders() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [debounced, setDebounced] = useState(search)
  const [status, setStatus] = useState('all')

  const list = useListResource<OrderRow>({
    endpoint: '/admin/orders',
    rowsKey: 'orders',
    searchParam: 'search',
    pageSize: 20,
    initialSearch: params.get('search') ?? '',
  })

  // The hook owns the query; keep the URL reflecting the admin's search so a
  // refresh or a shared link lands on the same view.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (list.search !== debounced) list.setSearch(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    list.setFilter('status', status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (list.search.trim()) {
      setParams({ search: list.search.trim() }, { replace: true })
    } else if (params.get('search')) {
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.search])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [assignOpen, setAssignOpen] = useState(false)
  const [riders, setRiders] = useState<RiderOption[]>([])
  const [riderSearch, setRiderSearch] = useState('')
  const [ridersLoading, setRidersLoading] = useState(false)
  const [riderError, setRiderError] = useState('')

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setDetailLoading(true)
    setDetailError('')
    try {
      const response = await api.get(`/admin/orders/${id}`)
      setDetail((response.data?.data?.order ?? null) as OrderDetail | null)
    } catch (failure) {
      setDetailError(apiErrorMessage(failure, 'Could not load this order.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openOrder = (id: string) => {
    setSelectedId(id)
    setDetail(null)
    void loadDetail(id)
  }

  const closeOrder = () => {
    setSelectedId(null)
    setDetail(null)
    setCancelOpen(false)
    setAssignOpen(false)
  }

  const afterAction = async (message: string) => {
    toast.success(message)
    await list.reload()
    if (selectedId) await loadDetail(selectedId, true)
  }

  const advance = async (next: string) => {
    if (!selectedId) return
    setBusy(true)
    try {
      await api.patch(`/admin/orders/${selectedId}/status`, { status: next })
      await afterAction(`Order moved to ${humanizeStatus(next)}`)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change the order status.'))
    } finally {
      setBusy(false)
    }
  }

  const cancelOrder = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      await api.post(`/admin/orders/${selectedId}/cancel`, {
        reason: cancelReason.trim() || 'Cancelled by admin',
      })
      setCancelOpen(false)
      setCancelReason('')
      await afterAction('Order cancelled')
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not cancel this order.'))
    } finally {
      setBusy(false)
    }
  }

  const openAssign = async () => {
    setAssignOpen(true)
    setRidersLoading(true)
    setRiderError('')
    try {
      const response = await api.get('/admin/riders?approval=approved&limit=100&page=1')
      setRiders((response.data?.data?.riders ?? []) as RiderOption[])
    } catch (failure) {
      setRiderError(apiErrorMessage(failure, 'Could not load approved riders.'))
    } finally {
      setRidersLoading(false)
    }
  }

  const assign = async (riderId: string) => {
    if (!selectedId) return
    setBusy(true)
    try {
      await api.post(`/admin/orders/${selectedId}/assign-rider`, { riderId })
      setAssignOpen(false)
      await afterAction('Rider assigned')
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not assign this rider.'))
    } finally {
      setBusy(false)
    }
  }

  const filteredRiders = useMemo(() => {
    const needle = riderSearch.trim().toLowerCase()
    const sorted = [...riders].sort(
      (a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)),
    )
    if (!needle) return sorted
    return sorted.filter(
      (rider) =>
        rider.name?.toLowerCase().includes(needle) ||
        rider.phone?.toLowerCase().includes(needle) ||
        rider.user?.phone?.toLowerCase().includes(needle) ||
        rider.vehiclePlate?.toLowerCase().includes(needle),
    )
  }, [riders, riderSearch])

  const columns: Column<OrderRow>[] = [
    {
      key: 'order',
      label: 'Order',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.orderNumber || row._id.slice(-8)}</div>
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
          <div className="text-ink">{row.customer?.name || '-'}</div>
          {row.customer?.phone && <div className="text-xs text-ink-subtle">{row.customer.phone}</div>}
        </div>
      ),
    },
    {
      key: 'restaurant',
      label: 'Restaurant',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">{row.restaurant?.emoji || '🍽️'}</span>
          <span className="truncate">{row.restaurant?.name || '-'}</span>
        </span>
      ),
    },
    {
      key: 'rider',
      label: 'Rider',
      render: (row) =>
        row.rider?.name ? (
          <span className="text-ink">{row.rider.name}</span>
        ) : (
          <span className="text-ink-subtle">Unassigned</span>
        ),
    },
    {
      key: 'items',
      label: 'Items',
      secondary: true,
      align: 'right',
      render: (row) => row.items?.length ?? 0,
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.total,
      render: (row) => <span className="font-semibold text-ink">{formatCurrency(row.total ?? 0)}</span>,
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

  const detailActions = detail ? (
    <div className="flex flex-wrap items-center gap-2">
      {(ORDER_FLOW[detail.status] ?? []).map((next) => (
        <Button
          key={next}
          variant="primary"
          size="sm"
          loading={busy}
          icon={next === 'delivered' ? CheckCircle2 : undefined}
          onClick={() => void advance(next)}
        >
          Mark {humanizeStatus(next).toLowerCase()}
        </Button>
      ))}
      {!CLOSED.includes(detail.status) && !detail.rider && (
        <Button variant="secondary" size="sm" icon={Bike} onClick={() => void openAssign()}>
          Assign rider
        </Button>
      )}
      {!CLOSED.includes(detail.status) && (
        <Button
          variant="secondary"
          size="sm"
          icon={Ban}
          onClick={() => setCancelOpen(true)}
          className="text-danger hover:border-danger/40 hover:bg-danger-soft"
        >
          Cancel
        </Button>
      )}
    </div>
  ) : null

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Follow every order from the kitchen to the doorstep, assigned rider or not."
        actions={
          <Button variant="secondary" icon={ShoppingBag} onClick={() => void list.reload()}>
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
              placeholder="Search by order number"
              icon={Search}
              aria-label="Search orders by order number"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              options={[
                { value: 'all', label: 'All statuses' },
                ...ORDER_STATUSES.map((value) => ({
                  value,
                  label: humanizeStatus(value),
                })),
              ]}
            />
          </div>
          {(search || status !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setStatus('all')
                list.setSearch('')
                list.setFilter('status', 'all')
              }}
            >
              Clear filters
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} orders
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No orders match"
          emptyDescription="Try a different status or clear the search."
          emptyIcon={ShoppingBag}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={(row) => openOrder(row._id)}
          actions={(row) => (
            <Dropdown
              items={[
                { label: 'Open order', icon: Package, onClick: () => openOrder(row._id) },
                {
                  label: 'Cancel order',
                  icon: Ban,
                  danger: true,
                  disabled: CLOSED.includes(row.status),
                  onClick: () => {
                    setSelectedId(row._id)
                    setCancelOpen(true)
                  },
                },
              ]}
            />
          )}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="orders"
        />
      </Card>

      {/* Detail */}
      <Drawer
        open={Boolean(selectedId)}
        onClose={closeOrder}
        title={detail?.orderNumber || 'Order'}
        description={
          detail
            ? `${humanizeStatus(detail.status)} · ${formatDateTime(detail.createdAt)}`
            : 'Loading order…'
        }
        width="lg"
        footer={detailActions}
      >
        {detailLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : detailError ? (
          <div className="space-y-3">
            <InlineError message={detailError} />
            {selectedId && (
              <Button variant="secondary" size="sm" onClick={() => void loadDetail(selectedId)}>
                Try again
              </Button>
            )}
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(detail.status)} dot>
                {humanizeStatus(detail.status)}
              </Badge>
              <Badge tone={statusTone(detail.paymentStatus ?? '')}>
                Payment: {humanizeStatus(detail.paymentStatus ?? detail.paymentMethod)}
              </Badge>
              {detail.paymentMethod && <Badge tone="neutral">{detail.paymentMethod}</Badge>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-muted/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  <User className="h-3.5 w-3.5" aria-hidden="true" /> Customer
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">{detail.customer?.name || '-'}</p>
                {detail.customer?.phone && (
                  <p className="text-xs text-ink-muted">{detail.customer.phone}</p>
                )}
                {detail.customer?.email && (
                  <p className="truncate text-xs text-ink-subtle">{detail.customer.email}</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface-muted/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  <Bike className="h-3.5 w-3.5" aria-hidden="true" /> Rider
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {detail.rider?.name || 'Not assigned yet'}
                </p>
                {detail.rider?.phone && (
                  <p className="flex items-center gap-1 text-xs text-ink-muted">
                    <Phone className="h-3 w-3" aria-hidden="true" /> {detail.rider.phone}
                  </p>
                )}
                {!detail.rider && !CLOSED.includes(detail.status) && (
                  <Button
                    variant="soft"
                    size="sm"
                    className="mt-2"
                    icon={Bike}
                    onClick={() => void openAssign()}
                  >
                    Assign a rider
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Delivery address
              </p>
              <p className="mt-1 text-sm text-ink">{detail.addressSnapshot?.full || '-'}</p>
              {detail.addressSnapshot?.area && (
                <p className="text-xs text-ink-subtle">{detail.addressSnapshot.area}</p>
              )}
              {detail.distanceKm ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {detail.distanceKm.toFixed?.(1) ?? detail.distanceKm} km · about{' '}
                  {detail.estimatedMinutes ?? '?'} min
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <Package className="h-3.5 w-3.5" aria-hidden="true" /> Items
              </p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {(detail.items ?? []).map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-base" aria-hidden="true">
                      {item.emoji || '🍽️'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {item.name} <span className="text-ink-subtle">× {item.quantity ?? 1}</span>
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}
                    </span>
                  </li>
                ))}
                {(detail.items ?? []).length === 0 && (
                  <li className="px-3 py-3 text-sm text-ink-muted">No item snapshot stored.</li>
                )}
              </ul>
            </div>

            <dl className="space-y-1.5 rounded-xl border border-line bg-surface-muted/40 p-3 text-sm">
              {[
                ['Subtotal', detail.subtotal],
                ['Delivery fee', detail.deliveryFee],
                ['Platform fee', detail.platformFee],
                ['Discount', detail.discount ? -detail.discount : 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between text-xs text-ink-muted">
                  <dt>{label}</dt>
                  <dd>{formatCurrency(Number(value ?? 0))}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-1.5 text-sm font-semibold text-ink">
                <dt>Total</dt>
                <dd>{formatCurrency(detail.total ?? 0)}</dd>
              </div>
              {detail.paymentTransactionRef && (
                <div className="flex justify-between text-[11px] text-ink-subtle">
                  <dt>Ref</dt>
                  <dd className="font-mono">{detail.paymentTransactionRef}</dd>
                </div>
              )}
            </dl>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                Timeline
              </p>
              <ol className="space-y-2">
                {(detail.statusHistory ?? []).map((event, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink">
                        {humanizeStatus(event.status)}
                      </span>
                      <span className="block text-[11px] text-ink-subtle">
                        {event.note} {event.at ? `· ${formatDateTime(event.at)}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
                {(detail.statusHistory ?? []).length === 0 && (
                  <li className="text-xs text-ink-muted">No history recorded.</li>
                )}
              </ol>
            </div>

            {detail.cancelReason && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                <span className="font-semibold">Cancelled:</span> {detail.cancelReason}
              </div>
            )}
          </div>
        ) : null}
      </Drawer>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void cancelOrder()}
        title="Cancel this order?"
        message="The customer and rider are notified immediately. A wallet payment is refunded; this cannot be undone."
        confirmLabel="Cancel order"
        busy={busy}
      >
        <Field label="Reason (optional)" htmlFor="cancel-reason">
          <Textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. Restaurant is out of stock"
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      {/* Assign rider */}
      {assignOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setAssignOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-lg animate-scale-in overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Assign a rider</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Approved riders only. Online riders are listed first.
              </p>
            </div>
            <div className="border-b border-line px-5 py-3">
              <Input
                value={riderSearch}
                onChange={(event) => setRiderSearch(event.target.value)}
                placeholder="Search name, phone or bike number"
                icon={Search}
                aria-label="Search riders"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {ridersLoading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : riderError ? (
                <div className="p-3">
                  <InlineError message={riderError} />
                </div>
              ) : filteredRiders.length === 0 ? (
                <EmptyState
                  icon={Bike}
                  title="No approved riders"
                  description="Approve a rider from the Riders screen first."
                />
              ) : (
                <ul className="space-y-1">
                  {filteredRiders.map((rider) => (
                    <li key={rider._id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void assign(rider.user?._id ?? rider.user?.id ?? rider._id)
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-muted disabled:opacity-60"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand">
                          <Bike className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink">
                              {rider.name}
                            </span>
                            <Badge tone={rider.isOnline ? 'success' : 'neutral'} dot>
                              {rider.isOnline ? 'Online' : 'Offline'}
                            </Badge>
                          </span>
                          <span className="block text-xs text-ink-subtle">
                            {rider.phone || rider.user?.phone || 'No phone'} ·{' '}
                            {rider.vehiclePlate || 'No plate'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => setAssignOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
