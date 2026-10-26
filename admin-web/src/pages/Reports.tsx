import { useMemo, useState } from 'react'
import {
  BarChart3,
  Bike,
  CircleAlert,
  Info,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { useApi } from '../lib/useApi'
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  percent,
} from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import StatCard from '../components/ui/StatCard'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { DonutChart } from '../components/charts/Charts'

interface ReportsData {
  range?: string
  summary?: { revenue?: number; orders?: number; rides?: number; foodShare?: number }
  topRestaurants?: { _id: string; name: string; revenue: number; orders: number }[]
  topDishes?: { _id: string; total: number }[]
  serviceBreakdown?: { label: string; value: number }[]
}

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'quarter', label: 'Last 90 days' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
]

/** Revenue, volume and the kitchens/dishes that drove them. */
export default function Reports() {
  const [range, setRange] = useState('30d')
  const reports = useApi<ReportsData>(`/admin/reports?range=${range}`, (payload) => {
    const data = (payload as { data?: ReportsData })?.data
    return data ?? {}
  })

  const data = reports.data ?? {}
  const summary = data.summary ?? {}
  const topRestaurants = data.topRestaurants ?? []
  const topDishes = data.topDishes ?? []
  const serviceBreakdown = (data.serviceBreakdown ?? []).filter((entry) => entry.value > 0)

  const maxRestaurantRevenue = useMemo(
    () => Math.max(0, ...topRestaurants.map((row) => row.revenue)),
    [topRestaurants],
  )
  const maxDishRevenue = useMemo(
    () => Math.max(0, ...topDishes.map((row) => row.total)),
    [topDishes],
  )

  const customerTotal = (summary.orders ?? 0) + (summary.rides ?? 0)
  const hasVolume = customerTotal > 0

  if (reports.error) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Reports" description="Revenue and volume for the period you choose." />
        <Card>
          <ErrorState message={reports.error} onRetry={() => void reports.reload()} />
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Overview"
        title="Reports"
        description="What the platform earned and delivered in the period — straight from delivered orders and completed rides."
        actions={
          <>
            <div className="w-40">
              <Select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                aria-label="Report period"
                options={RANGES}
              />
            </div>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={reports.loading}
              onClick={() => void reports.reload()}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCompactCurrency(summary.revenue ?? 0)}
          hint="Delivered orders + completed rides"
          icon={Wallet}
          tone="brand"
          loading={reports.loading}
        />
        <StatCard
          label="Orders"
          value={formatNumber(summary.orders ?? 0)}
          hint="Placed in this period"
          icon={ShoppingBag}
          tone="info"
          loading={reports.loading}
        />
        <StatCard
          label="Rides"
          value={formatNumber(summary.rides ?? 0)}
          hint="Requested in this period"
          icon={Bike}
          tone="success"
          loading={reports.loading}
        />
        <StatCard
          label="Food share"
          value={`${summary.foodShare ?? 0}%`}
          hint={`${formatNumber(summary.orders ?? 0)} food vs ${formatNumber(
            summary.rides ?? 0,
          )} rides`}
          icon={UtensilsCrossed}
          tone="warning"
          loading={reports.loading}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Top restaurants"
            description="Delivered revenue in this period · the five busiest kitchens"
            icon={<Store className="h-4 w-4" aria-hidden="true" />}
            action={<Badge tone="brand">{RANGES.find((entry) => entry.value === range)?.label}</Badge>}
          />
          {reports.loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardBody>
          ) : topRestaurants.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No delivered orders in this period"
              description="Revenue appears here once orders start being delivered."
            />
          ) : (
            <CardBody className="space-y-4">
              {topRestaurants.map((restaurant, index) => {
                const share = maxRestaurantRevenue
                  ? Math.max(4, Math.round((restaurant.revenue / maxRestaurantRevenue) * 100))
                  : 0
                return (
                  <div key={restaurant._id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[10px] font-bold text-brand">
                          {index + 1}
                        </span>
                        <span className="truncate font-medium text-ink">{restaurant.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold text-ink">
                          {formatCurrency(restaurant.revenue)}
                        </span>
                        <span className="ml-2 text-xs text-ink-subtle">
                          {formatNumber(restaurant.orders)} orders
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong transition-all duration-700"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Volume by service"
            description="Orders vs rides requested"
            icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {reports.loading ? (
              <Skeleton className="h-48 w-full" />
            ) : serviceBreakdown.length === 0 ? (
              <EmptyState icon={BarChart3} title="Nothing happened yet" />
            ) : (
              <>
                <DonutChart data={serviceBreakdown} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl border border-line px-2 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                      Food
                    </p>
                    <p className="text-sm font-bold text-ink">
                      {percent(summary.orders ?? 0, customerTotal)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-line px-2 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                      Rides
                    </p>
                    <p className="text-sm font-bold text-ink">
                      {percent(summary.rides ?? 0, customerTotal)}%
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top dishes"
            description="By revenue from delivered orders · the ten best sellers"
            icon={<UtensilsCrossed className="h-4 w-4" aria-hidden="true" />}
          />
          {reports.loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </CardBody>
          ) : topDishes.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="No dish sales yet"
              description="Delivered order items are counted here."
            />
          ) : (
            <CardBody className="space-y-3">
              {topDishes.map((dish, index) => {
                const share = maxDishRevenue
                  ? Math.max(4, Math.round((dish.total / maxDishRevenue) * 100))
                  : 0
                return (
                  <div key={`${dish._id}-${index}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-ink">
                        <span className="mr-1.5 text-ink-subtle">{index + 1}.</span>
                        {dish._id}
                      </span>
                      <span className="shrink-0 font-semibold text-ink">
                        {formatCurrency(dish.total)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand/70 transition-all duration-700"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader
            title="How these numbers are counted"
            icon={<Info className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody className="space-y-4 text-sm leading-relaxed text-ink-muted">
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p>
                <strong className="text-ink">Revenue</strong> adds the total of every delivered
                order and the fare of every completed ride in the period. Pending, cancelled and
                in-flight work is not counted.
              </p>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p>
                <strong className="text-ink">Orders and rides</strong> count everything created in
                the period, including cancellations — it is a workload number, not a revenue one.
              </p>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p>
                <strong className="text-ink">Food share</strong> is the share of orders among
                orders + rides. It measures mix, not money.
              </p>
            </div>
            {!hasVolume && !reports.loading && (
              <p className="rounded-xl border border-line bg-surface-muted/60 px-3 py-2 text-xs">
                There is no activity in this period yet. Try a wider range.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-ink-subtle">
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
        Figures come from the same orders and rides the rest of the panel uses.
      </p>
    </div>
  )
}
