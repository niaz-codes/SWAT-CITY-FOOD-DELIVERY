import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CircleAlert,
  CircleCheckBig,
  LogOut,
  ShoppingBag,
  Store,
  Timer,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { formatCurrency } from '../lib/format'
import type { PortalContextValue, PortalMePayload, RestaurantStatus } from '../lib/portalTypes'
import { useAuthStore } from '../stores/authStore'
import { useApi } from '../lib/useApi'
import ThemeToggle from '../components/ThemeToggle'
import { Spinner } from '../components/ui/States'

/** The sidebar, in the order an owner works their day. */
const PORTAL_NAV: { name: string; to: string; icon: LucideIcon }[] = [
  { name: 'Orders', to: '/portal/orders', icon: ShoppingBag },
  { name: 'Menu', to: '/portal/menu', icon: UtensilsCrossed },
  { name: 'Profile', to: '/portal/profile', icon: Store },
]

const STATUS_OPTIONS: { value: RestaurantStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'busy', label: 'Busy' },
  { value: 'closed', label: 'Closed' },
]

function statusClasses(status: RestaurantStatus, active: boolean): string {
  if (!active) return 'text-ink-muted hover:text-ink'
  if (status === 'open') return 'bg-positive-soft text-positive'
  if (status === 'busy') return 'bg-warning-soft text-warning'
  return 'bg-danger-soft text-danger'
}

/** The restaurant shown in the sidebar/header, with the optimistic status applied. */
function presentRestaurant(
  data: PortalMePayload,
  optimistic: RestaurantStatus | null,
): PortalMePayload {
  if (!optimistic || optimistic === data.restaurant.status) return data
  return { ...data, restaurant: { ...data.restaurant, status: optimistic } }
}

/**
 * The restaurant-owner portal shell, on the same visual language as the admin
 * panel but with only an owner's pages.
 *
 * `/restaurant/me` is fetched once here and handed to every page through the
 * outlet context, so a page never re-fetches the restaurant it is already
 * rendering — and the open/busy/closed switch in the header updates everywhere
 * at once.
 */
export default function PortalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const { data, loading, error, reload } = useApi<PortalMePayload>('/restaurant/me', (payload) => {
    const body = (payload as { data?: PortalMePayload })?.data ?? (payload as PortalMePayload)
    return body
  })

  // The kitchen switch answers instantly while the request travels; whatever
  // the server answers becomes the truth again after the reload.
  const [optimisticStatus, setOptimisticStatus] = useState<RestaurantStatus | null>(null)
  const restaurant = data ? presentRestaurant(data, optimisticStatus).restaurant : null

  const refreshMe = useCallback(() => {
    setOptimisticStatus(null)
    reload()
  }, [reload])

  useEffect(() => {
    setOptimisticStatus(null)
  }, [data])

  const setStatus = useCallback(
    async (status: RestaurantStatus) => {
      if (!data || restaurant?.status === status) return
      setOptimisticStatus(status)
      try {
        await api.patch('/restaurant/me', { status })
        if (status === 'closed') {
          toast.success('Your kitchen is now closed', {
            description: 'Customers can no longer start a new order from your menu.',
          })
        } else {
          toast.success(`Kitchen marked ${status}`)
        }
      } catch (failure) {
        toast.error(apiErrorMessage(failure, 'Could not change the kitchen status.'))
      } finally {
        refreshMe()
      }
    },
    [data, restaurant?.status, refreshMe],
  )

  const onSignOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const currentName = PORTAL_NAV.find((item) => location.pathname.startsWith(item.to))?.name

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (error || !data || !restaurant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger ring-1 ring-danger/20">
          <CircleAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Could not load your restaurant</p>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            {error || 'Try again in a moment, or sign out and back in.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshMe()}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const context: PortalContextValue = { data, loading, error, refreshMe }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-[100rem]">
        {/* Sidebar (desktop). */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            {restaurant.imageUrl ? (
              <img
                src={restaurant.imageUrl}
                alt=""
                className="h-9 w-9 rounded-lg object-cover ring-1 ring-line"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-strong text-sm font-bold text-brand-contrast">
                {restaurant.emoji || (restaurant.name?.[0] ?? 'R')}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-ink">
                {restaurant.name}
              </span>
              <span className="block text-xs text-ink-muted">Restaurant portal</span>
            </span>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Portal">
            {PORTAL_NAV.map(({ name, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-soft text-brand'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {name}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-3 border-t border-line px-4 py-4">
            {/* Today at a glance - the two numbers an owner checks first. */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface-muted px-2 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Today
                </span>
                <span className="text-sm font-bold text-ink">{data.stats.todayOrders}</span>
              </div>
              <div className="rounded-xl bg-surface-muted px-2 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Revenue
                </span>
                <span className="text-sm font-bold text-ink">
                  {formatCurrency(data.stats.todayRevenue)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                {(data.owner.name || user?.name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">
                  {data.owner.name || user?.name || 'Owner'}
                </span>
                <span className="block truncate text-[11px] text-ink-subtle">
                  {data.owner.email || user?.email}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void onSignOut()}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main column. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <span className="flex items-center gap-2 sm:hidden">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">
                  {restaurant.emoji || (restaurant.name?.[0] ?? 'R')}
                </span>
                <span className="max-w-[9rem] truncate text-sm font-semibold text-ink">
                  {restaurant.name}
                </span>
              </span>
              <h1 className="hidden text-[15px] font-semibold tracking-tight text-ink sm:block">
                {currentName}
              </h1>
              <span className="flex-1" />
              {restaurant.isApproved ? (
                <span className="hidden items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-1 text-[11px] font-semibold text-positive ring-1 ring-inset ring-positive/20 sm:inline-flex">
                  <CircleCheckBig className="h-3.5 w-3.5" aria-hidden="true" />
                  Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning ring-1 ring-inset ring-warning/25">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                  Awaiting approval
                </span>
              )}
              <div
                role="group"
                aria-label="Kitchen status"
                className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-muted p-0.5"
              >
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={restaurant.status === option.value}
                    onClick={() => void setStatus(option.value)}
                    className={[
                      'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                      statusClasses(option.value, restaurant.status === option.value),
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="hidden lg:block">
                <ThemeToggle />
              </div>
            </div>
            {/* The tablet/phone nav replaces the sidebar. */}
            <nav className="flex gap-1 overflow-x-auto px-4 pb-2.5 md:hidden" aria-label="Portal">
              {PORTAL_NAV.map(({ name, to, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                      isActive
                        ? 'bg-brand text-brand-contrast'
                        : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                    ].join(' ')
                  }
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {name}
                </NavLink>
              ))}
            </nav>
          </header>

          {!restaurant.isApproved && (
            <div className="border-b border-warning/25 bg-warning-soft px-4 py-2.5 text-xs font-medium text-warning sm:px-6">
              Your restaurant is waiting for an admin to approve it. You can prepare the menu and
              profile now — customers will see the restaurant the moment it is approved.
            </div>
          )}

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
            <Outlet context={context} />
          </main>
        </div>
      </div>
    </div>
  )
}
