import { useId, useMemo } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useThemeStore } from '../../stores/themeStore'

/**
 * Recharts draws into SVG, so it cannot read Tailwind classes. The palette is
 * read from the same CSS variables the rest of the panel uses and re-read
 * whenever the theme flips.
 */
function usePalette() {
  const theme = useThemeStore((state) => state.theme)
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
      `rgb(${style.getPropertyValue(name).trim() || fallback})`
    return {
      theme,
      brand: read('--brand', '15 118 110'),
      brandStrong: read('--brand-strong', '13 148 136'),
      info: read('--info', '3 105 161'),
      warning: read('--warning', '180 83 9'),
      danger: read('--danger', '190 18 45'),
      positive: read('--positive', '5 150 105'),
      grid: `rgb(${style.getPropertyValue('--line').trim() || '228 234 234'})`,
      axis: `rgb(${style.getPropertyValue('--ink-subtle').trim() || '124 138 150'})`,
      surface: `rgb(${style.getPropertyValue('--surface').trim() || '255 255 255'})`,
      ink: `rgb(${style.getPropertyValue('--ink').trim() || '15 23 32'})`,
      line: `rgb(${style.getPropertyValue('--line').trim() || '228 234 234'})`,
    }
  }, [theme])
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--line))',
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--ink))',
  boxShadow: '0 18px 40px -20px rgb(0 0 0 / .4)',
  fontSize: 12,
  padding: '8px 10px',
} as const

interface RevenueOrdersChartProps {
  data: { label: string; revenue: number; orders: number }[]
}

/** Revenue as an area, orders as bars, sharing one 7-day x-axis. */
export function RevenueOrdersChart({ data }: RevenueOrdersChartProps) {
  const palette = usePalette()
  // useId keeps the SVG gradient unique without a random value that changes
  // between renders (and confuses React's purity checks).
  const uniqueId = useId()
  const gradientId = `revenue-fill-${uniqueId.replace(/:/g, '')}`

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.brand} stopOpacity={0.35} />
              <stop offset="100%" stopColor={palette.brand} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: palette.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            yAxisId="revenue"
            tick={{ fill: palette.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
            }
          />
          <YAxis yAxisId="orders" orientation="right" hide />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgb(var(--ink) / 0.04)' }}
            formatter={(value, name) =>
              name === 'Revenue'
                ? [`Rs ${Number(value).toLocaleString('en-PK')}`, 'Revenue']
                : [String(value), 'Orders']
            }
          />
          <Bar
            yAxisId="orders"
            dataKey="orders"
            name="Orders"
            fill={palette.info}
            opacity={0.22}
            radius={[6, 6, 0, 0]}
            maxBarSize={26}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={palette.brand}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 0 }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

interface DonutDatum {
  label: string
  value: number
}

const DONUT_COLORS = ['brand', 'info', 'warning', 'positive', 'danger'] as const

/** A service split / composition donut with a centered total. */
export function DonutChart({ data }: { data: DonutDatum[] }) {
  const palette = usePalette()
  const colors = DONUT_COLORS.map((key) => palette[key])
  const total = data.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={entry.label} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            Total
          </span>
          <span className="text-xl font-bold text-ink">{total.toLocaleString('en-PK')}</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {data.map((entry, index) => (
          <li key={entry.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
                aria-hidden="true"
              />
              {entry.label}
            </span>
            <span className="font-semibold text-ink">
              {entry.value.toLocaleString('en-PK')}
              <span className="ml-1.5 text-xs font-normal text-ink-subtle">
                {total ? `${Math.round((entry.value / total) * 100)}%` : '0%'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface GrowthChartProps {
  data: { label: string; customers: number; riders: number }[]
}

/** New customers vs new riders per day. */
export function GrowthChart({ data }: GrowthChartProps) {
  const palette = usePalette()
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: palette.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fill: palette.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(var(--ink) / 0.04)' }} />
          <Bar
            dataKey="customers"
            name="Customers"
            fill={palette.brand}
            radius={[5, 5, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="riders"
            name="Riders"
            fill={palette.warning}
            radius={[5, 5, 0, 0]}
            maxBarSize={22}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
