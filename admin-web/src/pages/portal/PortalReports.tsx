import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  AlarmClockMinus,
  Banknote,
  CircleAlert,
  Flame,
  Receipt,
  ShoppingBag,
  Timer,
} from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { PortalContextValue } from '../../lib/portalTypes'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import { EmptyState, Spinner, ErrorState } from '../../components/ui/States'
import { StatCard } from '../../components/ui'
import { RevenueOrdersChart } from '../../components/charts/Charts'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'

/**
 * Owner reports. Reads the owner-scoped `/restaurant/reports` - the same data
 * pattern as the admin panel's Reports page, but scoped to the kitchen that is
 * looking at it. Nothing here relies on client-side math beyond simple
 * formatting; every figure comes from this restaurant's orders on the server.
 */

/** The same rolling windows the backend (and the admin panel) support. */
const RANGE_TABS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'quarter', label: '90 days' },
]

interface ReportDish {
  id: string | null
  name: string
  qty: number
  revenue: number
}

interface PortalReportsPayload {
  range: string
  summary: {
    deliveredOrders: number
    grossRevenue: number
    avgOrder: number
    pending: number
    inKitchen: number
    cancelled: number
    rejected: number
  }
  series: { date: string; orders: number; revenue: number }[]
  topDishes: ReportDish[]
  popularIds: string[]
}

function rangeDefault(range: string): string {
  return RANGE_TABS.some((tab) => tab.value === range) ? range : '7d'
}

export default function PortalReports() {
  const context = useOutletContext<PortalContextValue>()
  const [range, setRange] = useState('7d')
  const [report, setReport] = useState<PortalReportsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bumping this forces the effect below to run even when the range is unchanged.
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    void api
      .get(`/restaurant/reports?range=${range}`)
      .then((response) => {
        if (!active) return
        const body = response.data as { data?: PortalReportsPayload }
        const payload = body?.data ?? null
        // Mirror what was asked onto what the server accepted, so the tabs and
        // the data always describe the same window.
        if (payload) payload.range = rangeDefault(payload.range)
        setReport(payload)
        setError('')
      })
      .catch((failure) => {
        if (active) setError(apiErrorMessage(failure, 'Could not load your reports.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [range, refreshTick])

  const refresh = () => setRefreshTick((tick) => tick + 1)

  const chartData = useMemo(
    () =>
      (report?.series ?? []).map((row) => ({
        label: new Date(`${row.date}T00:00:00`).toLocaleDateString('en', {
          month: 'short',
          day: 'numeric',
        }),
        revenue: row.revenue,
        orders: row.orders,
      })),
    [report?.series],
  )

  const stats = report?.summary

  return (
    <div>
      <PageHeader
        title="Reports"
        description="How your kitchen is actually doing: delivered revenue, order flow and the dishes customers keep coming back for."
        actions={
          <>
            <Tabs items={RANGE_TABS} value={range} onChange={setRange} />
            <Button variant="secondary" size="sm" onClick={refresh}>
              Refresh
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : loading && !report ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !report || !stats ? (
        <EmptyState
          icon={Receipt}
          title="No report yet"
          description="Reports appear as soon as your restaurant has orders coming in."
        />
      ) : (
        <div className="space-y-5">
          {/* KPI row - every number is server-computed for the chosen window. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Revenue"
              value={formatCurrency(stats.grossRevenue)}
              hint={`${stats.deliveredOrders} delivered order${stats.deliveredOrders === 1 ? '' : 's'}`}
              icon={Banknote}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="Average order"
              value={formatCurrency(stats.avgOrder)}
              hint="per delivered order"
              icon={ShoppingBag}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="In kitchen"
              value={stats.inKitchen + stats.pending}
              hint={`${stats.pending} waiting · ${stats.inKitchen} cooking`}
              icon={Timer}
              tone="warning"
              loading={loading}
            />
            <StatCard
              label="Cancelled / rejected"
              value={stats.cancelled + stats.rejected}
              hint={`${stats.cancelled} cancelled · ${stats.rejected} rejected`}
              icon={AlarmClockMinus}
              tone={stats.cancelled + stats.rejected > 0 ? 'danger' : 'success'}
              loading={loading}
            />
          </div>

          <Card>
            <CardHeader
              title="Order flow"
              description={`${report.range} window - revenue counts delivered orders only`}
            />
            <CardBody>
              {chartData.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No orders in this window"
                  description="When customers order, the daily flow shows up here."
                />
              ) : (
                <RevenueOrdersChart data={chartData} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Top dishes"
              description="By quantity sold across delivered orders in this window"
            />
            <CardBody className="pt-0">
              {report.topDishes.length === 0 ? (
                <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
                  <CircleAlert className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                  No delivered orders yet - the ranking fills in as sales come through.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {report.topDishes.map((dish, index) => (
                    <li key={dish.id ?? dish.name} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-6 text-center text-sm font-bold text-ink-subtle">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {dish.name}
                        </span>
                        <span className="text-xs text-ink-muted">{dish.qty} sold</span>
                      </span>
                      {index < 3 && (
                        <Badge tone="warning" dot>
                          <Flame className="mr-1 h-3 w-3" aria-hidden="true" /> Popular
                        </Badge>
                      )}
                      <span className="text-sm font-semibold text-ink">
                        {formatCurrency(dish.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-subtle">
                Popularity comes from real delivered orders. Once you know what sells, mark a dish
                as popular for customers on the Menu page.
              </p>
            </CardBody>
          </Card>

          {context.data?.restaurant && (
            <p className="text-xs text-ink-subtle">
              Viewing {context.data.restaurant.name}&apos;s numbers. The owner portal is
              restaurant-scoped: no other kitchen&apos;s data can appear here.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
