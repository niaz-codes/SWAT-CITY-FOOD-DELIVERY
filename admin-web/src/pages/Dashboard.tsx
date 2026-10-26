import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Bike,
  CircleAlert,
  Clock,
  CreditCard,
  LifeBuoy,
  Package,
  RotateCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import {
  changePercent,
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  humanizeStatus,
  percent,
  statusTone,
  timeAgo,
} from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { DonutChart, GrowthChart, RevenueOrdersChart } from '../components/charts/Charts'

interface DashboardData {
  totals?: {
    revenue?: number
    orders?: number
    rides?: number
    riders?: number
    customers?: number
    restaurants?: number
    pendingRiderApprovals?: number
    openTickets?: number
    pendingWithdrawals?: number
  }
  today?: { orders?: number; rides?: number; revenue?: number }
  statusCounts?: Record<string, number>
  charts?: {
    dailyOrders?: { label: string; count: number }[]
    weeklyRevenue?: { label: string; value: number }[]
    serviceSplit?: { label: string; count: number }[]
    customerGrowth?: { label: string; count: number }[]
    riderGrowth?: { label: string; count: number }[]
  }
}

interface RecentOrder {
  _id: string
  orderNumber?: string | null
  status: string
  total: number
  createdAt: string
  customer?: { name?: string } | null
  restaurant?: { name?: string; emoji?: string | null } | null
}

const ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'on_the_way',
]

/** Dashboard: the numbers, the week's shape and the work waiting. */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({})
  const [recent, setRecent] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async (quiet = false) => {
    const current = ++requestId.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [dashboard, orders] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/orders?limit=6&page=1'),
      ])
      if (current !== requestId.current) return
      setData((dashboard.data?.data ?? {}) as DashboardData)
      setRecent((orders.data?.data?.orders ?? []) as RecentOrder[])
      setUpdatedAt(new Date())
    } catch (failure) {
      if (current !== requestId.current) return
      setError(apiErrorMessage(failure, 'Could not load the dashboard.'))
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the numbers fresh without ever interrupting the admin's work.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const totals = data.totals ?? {}
  const today = data.today ?? {}
  const statusCounts = data.statusCounts ?? {}

  const dailyOrders = data.charts?.dailyOrders ?? []
  const weeklyRevenue = data.charts?.weeklyRevenue ?? []
  const customerGrowth = data.charts?.customerGrowth ?? []
  const riderGrowth = data.charts?.riderGrowth ?? []

  const trendData = useMemo(
    () =>
      dailyOrders.map((day, index) => ({
        label: day.label,
        orders: day.count,
        revenue: weeklyRevenue[index]?.value ?? 0,
      })),
    [dailyOrders, weeklyRevenue],
  )

  const growthData = useMemo(
    () =>
      customerGrowth.map((day, index) => ({
        label: day.label,
        customers: day.count,
        riders: riderGrowth[index]?.count ?? 0,
      })),
    [customerGrowth, riderGrowth],
  )

  const activeOrders = ACTIVE_STATUSES.reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0)
  const delivered = statusCounts.delivered ?? 0
  const cancelled = statusCounts.cancelled ?? 0

  const yesterdayRevenue = weeklyRevenue[weeklyRevenue.length - 2]?.value ?? 0
  const revenueTrend = changePercent(today.revenue ?? 0, yesterdayRevenue)
  const yesterdayOrders = dailyOrders[dailyOrders.length - 2]?.count ?? 0
  const orderTrend = changePercent(today.orders ?? 0, yesterdayOrders)

  const serviceSplit = [
    { label: 'Food orders', value: totals.orders ?? 0 },
    { label: 'Rides', value: totals.rides ?? 0 },
  ].filter((entry) => entry.value > 0)

  const attention = [
    {
      to: '/riders',
      label: 'Rider applications waiting',
      value: totals.pendingRiderApprovals ?? 0,
      icon: Bike,
      action: 'Review riders',
    },
    {
      to: '/withdrawals',
      label: 'Payout requests to settle',
      value: totals.pendingWithdrawals ?? 0,
      icon: ArrowDownToLine,
      action: 'Open payouts',
    },
    {
      to: '/support',
      label: 'Support tickets open',
      value: totals.openTickets ?? 0,
      icon: LifeBuoy,
      action: 'Answer tickets',
    },
  ]

  const quickActions = [
    { to: '/orders', label: 'Order queue', icon: ShoppingBag, hint: `${activeOrders} active` },
    { to: '/riders', label: 'Approve riders', icon: Bike, hint: `${totals.pendingRiderApprovals ?? 0} waiting` },
    { to: '/restaurants', label: 'Restaurants', icon: Store, hint: `${totals.restaurants ?? 0} live` },
    { to: '/notifications', label: 'Send broadcast', icon: Bell, hint: 'Customers or riders' },
    { to: '/withdrawals', label: 'Payouts', icon: ArrowDownToLine, hint: `${totals.pendingWithdrawals ?? 0} pending` },
    { to: '/reports', label: 'Reports', icon: TrendingUp, hint: 'Revenue by period' },
  ]

  const statusOrder = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'rider_assigned',
    'picked_up',
    'on_the_way',
    'delivered',
    'cancelled',
  ].filter((status) => (statusCounts[status] ?? 0) > 0)

  if (error && !updatedAt) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Dashboard" description="Live numbers across the platform." />
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Everything moving right now — orders, riders, money and the work waiting for you."
        actions={
          <>
            <span className="hidden text-xs text-ink-subtle sm:block">
              {updatedAt ? `Updated ${timeAgo(updatedAt)}` : 'Loading…'}
            </span>
            <Button variant="secondary" icon={RotateCw} loading={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </>
        }
      />

      {error && updatedAt && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error} Showing the last numbers received.
        </div>
      )}

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue today"
          value={formatCurrency(today.revenue ?? 0)}
          hint={`${formatCompactCurrency(totals.revenue ?? 0)} all time`}
          icon={Wallet}
          tone="brand"
          trend={revenueTrend}
          loading={loading}
          to="/payments"
        />
        <StatCard
          label="Orders today"
          value={formatNumber(today.orders ?? 0)}
          hint={`${formatNumber(totals.orders ?? 0)} total orders`}
          icon={ShoppingBag}
          tone="info"
          trend={orderTrend}
          loading={loading}
          to="/orders"
        />
        <StatCard
          label="Orders in progress"
          value={formatNumber(activeOrders)}
          hint={activeOrders > 0 ? 'Kitchen to doorstep' : 'Nothing in the pipeline'}
          icon={Package}
          tone="warning"
          loading={loading}
          to="/orders"
        />
        <StatCard
          label="Riders registered"
          value={formatNumber(
            // `riders` is the registered total, not the live count; the real
            // online number lives on the riders screen.
            totals.riders ?? 0,
          )}
          hint={`${totals.pendingRiderApprovals ?? 0} approvals waiting`}
          icon={Bike}
          tone="success"
          loading={loading}
          to="/riders"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Customers"
          value={formatNumber(totals.customers ?? 0)}
          icon={Users}
          tone="neutral"
          loading={loading}
          to="/customers"
        />
        <StatCard
          label="Restaurants"
          value={formatNumber(totals.restaurants ?? 0)}
          icon={Store}
          tone="neutral"
          loading={loading}
          to="/restaurants"
        />
        <StatCard
          label="Delivered"
          value={formatNumber(delivered)}
          hint={`${percent(delivered, delivered + cancelled)}% completion`}
          icon={Package}
          tone="success"
          loading={loading}
          to="/orders"
        />
        <StatCard
          label="Cancelled"
          value={formatNumber(cancelled)}
          hint={`${percent(cancelled, delivered + cancelled)}% of closed orders`}
          icon={CircleAlert}
          tone="danger"
          loading={loading}
          to="/orders"
        />
      </div>

      {/* Charts */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenue and orders"
            description="Last 7 days · revenue is the area, orders the bars"
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            action={
              <Badge tone="brand" dot>
                {formatCurrency(weeklyRevenue.reduce((sum, day) => sum + day.value, 0))}
              </Badge>
            }
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : trendData.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No orders in the last 7 days"
                description="The chart fills in as soon as the first order lands."
              />
            ) : (
              <RevenueOrdersChart data={trendData} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Service split"
            description="Food orders vs rides, all time"
            icon={<UtensilsCrossed className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-44 w-full" />
            ) : serviceSplit.length === 0 ? (
              <EmptyState icon={UtensilsCrossed} title="Nothing to compare yet" />
            ) : (
              <DonutChart data={serviceSplit} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Recent orders */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Latest orders"
            description="The newest six, straight from the queue"
            icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
            action={
              <Link
                to="/orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                All orders <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          {loading ? (
            <CardBody className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </CardBody>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No orders yet"
              description="New orders will appear here as they are placed."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((order) => (
                <li key={order._id}>
                  <Link
                    to={`/orders?search=${encodeURIComponent(order.orderNumber ?? '')}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted/70"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-base">
                      {order.restaurant?.emoji || '🍽️'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {order.orderNumber || order._id.slice(-8)}
                        </span>
                        <Badge tone={statusTone(order.status)}>{humanizeStatus(order.status)}</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {order.customer?.name ?? 'Customer'} · {order.restaurant?.name ?? 'Restaurant'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-ink">
                        {formatCurrency(order.total ?? 0)}
                      </span>
                      <span className="block text-[11px] text-ink-subtle">
                        {timeAgo(order.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Attention + quick actions */}
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Needs attention"
              icon={<CircleAlert className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="divide-y divide-line">
              {attention.map((entry) => {
                const Icon = entry.icon
                return (
                  <li key={entry.to}>
                    <Link
                      to={entry.to}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted/70"
                    >
                      <span
                        className={[
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          entry.value > 0
                            ? 'bg-warning-soft text-warning'
                            : 'bg-positive-soft text-positive',
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {entry.label}
                        </span>
                        <span className="block text-[11px] text-ink-subtle">{entry.action}</span>
                      </span>
                      <span
                        className={[
                          'text-lg font-bold',
                          entry.value > 0 ? 'text-ink' : 'text-ink-subtle',
                        ].join(' ')}
                      >
                        {entry.value}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Quick actions"
              icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <Link
                    key={action.to + action.label}
                    to={action.to}
                    className="group flex flex-col gap-1.5 rounded-xl border border-line bg-surface-muted/50 p-2.5 transition hover:border-brand/30 hover:bg-brand-soft/40"
                  >
                    <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                    <span className="text-xs font-semibold text-ink">{action.label}</span>
                    <span className="text-[10px] text-ink-subtle">{action.hint}</span>
                  </Link>
                )
              })}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Growth + statuses */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="New customers and riders"
            description="Sign-ups per day over the last week"
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : growthData.length === 0 ? (
              <EmptyState icon={Users} title="No sign-ups this week" />
            ) : (
              <GrowthChart data={growthData} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Order pipeline"
            description="Where every order sits right now"
            icon={<Package className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-5 w-full" />
                ))}
              </div>
            ) : statusOrder.length === 0 ? (
              <EmptyState icon={Package} title="No orders to place yet" />
            ) : (
              <ul className="space-y-3">
                {statusOrder.map((status) => {
                  const count = statusCounts[status] ?? 0
                  const share = percent(count, totals.orders ?? 0)
                  return (
                    <li key={status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-ink">{humanizeStatus(status)}</span>
                        <span className="text-ink-subtle">
                          {count} · {share}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-brand transition-all duration-500"
                          style={{ width: `${Math.max(3, share)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-ink-subtle">
        <CreditCard className="h-3 w-3" aria-hidden="true" />
        Revenue counts delivered orders and completed rides only.
      </p>
    </div>
  )
}
