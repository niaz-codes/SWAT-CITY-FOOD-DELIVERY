import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  Bell,
  ChevronRight,
  Command,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { NAV_SECTIONS, navItemFor } from '../lib/navigation'
import { useAuthStore } from '../stores/authStore'
import Avatar from '../components/ui/Avatar'
import ThemeToggle from '../components/ThemeToggle'
import CommandPalette from '../components/CommandPalette'

interface Alerts {
  riders: number
  withdrawals: number
  support: number
}

const EMPTY_ALERTS: Alerts = { riders: 0, withdrawals: 0, support: 0 }

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('admin-sidebar') === 'collapsed'
  } catch {
    return false
  }
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alerts>(EMPTY_ALERTS)
  const [bellOpen, setBellOpen] = useState(false)

  const bellRef = useRef<HTMLDivElement | null>(null)
  const current = navItemFor(location.pathname)
  const section = NAV_SECTIONS.find((entry) =>
    entry.items.some((item) => item.to === current?.to),
  )

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      try {
        localStorage.setItem('admin-sidebar', next ? 'collapsed' : 'expanded')
      } catch {
        // storage unavailable - the layout simply forgets the preference
      }
      return next
    })
  }

  // Pending work in the sidebar: real counts, refreshed quietly.
  const loadAlerts = useCallback(async () => {
    try {
      const response = await api.get('/admin/dashboard')
      const totals = (response.data?.data?.totals ?? {}) as {
        pendingRiderApprovals?: number
        pendingWithdrawals?: number
        openTickets?: number
      }
      setAlerts({
        riders: totals.pendingRiderApprovals ?? 0,
        withdrawals: totals.pendingWithdrawals ?? 0,
        support: totals.openTickets ?? 0,
      })
    } catch {
      // The bell is a convenience; a failed poll must not disturb the panel.
    }
  }, [])

  useEffect(() => {
    void loadAlerts()
    const timer = window.setInterval(() => void loadAlerts(), 60_000)
    return () => window.clearInterval(timer)
  }, [loadAlerts])

  // Close transient chrome whenever the page changes.
  useEffect(() => {
    setMobileOpen(false)
    setBellOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!bellOpen) return
    const onClick = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBellOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [bellOpen])

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Signed out')
      navigate('/login')
    } catch {
      toast.error('Could not sign out. Please try again.')
    }
  }

  const alertTotal = alerts.riders + alerts.withdrawals + alerts.support

  const badgeFor = (key?: 'riders' | 'withdrawals' | 'support') => {
    if (!key) return 0
    return alerts[key]
  }

  const sidebar = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={[
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-3',
          isCollapsed ? 'justify-center' : 'justify-between',
        ].join(' ')}
      >
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none"
          aria-label="Swat City admin dashboard"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-strong text-brand-contrast shadow-sm shadow-brand/30">
            <UtensilsCrossed className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight text-ink">
                Swat City
              </span>
              <span className="block truncate text-[11px] font-medium text-ink-subtle">
                Admin console
              </span>
            </span>
          )}
        </Link>
        {!isCollapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-surface-muted hover:text-ink lg:flex"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="no-scrollbar flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {NAV_SECTIONS.map((entry) => (
          <div key={entry.label} className="mb-3">
            {!isCollapsed ? (
              <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-subtle/80">
                {entry.label}
              </p>
            ) : (
              <div className="mx-2 mb-2 h-px bg-line" />
            )}
            <ul className="space-y-0.5">
              {entry.items.map((item) => {
                const count = badgeFor(item.badge)
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      title={isCollapsed ? item.name : undefined}
                      className={({ isActive }) =>
                        [
                          'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition',
                          isCollapsed ? 'justify-center' : '',
                          isActive
                            ? 'bg-brand-soft text-brand'
                            : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && !isCollapsed && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand" />
                          )}
                          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          {!isCollapsed && (
                            <>
                              <span className="min-w-0 flex-1 truncate">{item.name}</span>
                              {count > 0 && (
                                <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning ring-1 ring-warning/20">
                                  {count > 99 ? '99+' : count}
                                </span>
                              )}
                            </>
                          )}
                          {isCollapsed && count > 0 && (
                            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account */}
      <div className="shrink-0 border-t border-line p-2">
        {!isCollapsed && (
          <div className="mb-2 rounded-xl bg-surface-muted p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true" />
              {alertTotal === 0
                ? 'Nothing waiting for you'
                : `${alertTotal} item${alertTotal === 1 ? '' : 's'} need attention`}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {alertTotal === 0
                ? 'Riders, payouts and tickets are clear.'
                : 'Open the bell for the details.'}
            </p>
          </div>
        )}
        <div
          className={[
            'flex items-center gap-2 rounded-xl p-1.5',
            isCollapsed ? 'justify-center' : '',
          ].join(' ')}
        >
          <Avatar name={user?.name} size="sm" />
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{user?.name ?? 'Admin'}</p>
              <p className="truncate text-[11px] text-ink-subtle">{user?.email}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-danger-soft hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside
        className={[
          'sticky top-0 hidden h-screen shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block',
          collapsed ? 'w-[76px]' : 'w-[264px]',
        ].join(' ')}
      >
        {sidebar(collapsed)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-[280px] animate-slide-in flex-col border-r border-line bg-surface">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted transition hover:text-ink lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted transition hover:text-ink lg:flex"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {section?.label ?? 'Admin'}
            </p>
            <p className="truncate text-sm font-semibold text-ink">{current?.name ?? 'Dashboard'}</p>
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 text-xs text-ink-subtle transition hover:border-ink/20 hover:text-ink md:flex"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="flex-1 text-left">Search orders, customers…</span>
            <kbd className="flex items-center gap-0.5 rounded border border-line bg-surface px-1 py-0.5 font-mono text-[10px]">
              <Command className="h-2.5 w-2.5" aria-hidden="true" />K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted transition hover:text-ink md:hidden"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <ThemeToggle />

          <div ref={bellRef} className="relative">
            <button
              type="button"
              onClick={() => setBellOpen((value) => !value)}
              aria-label={
                alertTotal > 0 ? `Notifications: ${alertTotal} waiting` : 'Notifications'
              }
              aria-haspopup="menu"
              aria-expanded={bellOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted shadow-sm transition hover:text-ink"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              {alertTotal > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-surface">
                  {alertTotal > 9 ? '9+' : alertTotal}
                </span>
              )}
            </button>

            {bellOpen && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-80 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <p className="text-sm font-semibold text-ink">Needs attention</p>
                  <Link
                    to="/notifications"
                    className="text-xs font-semibold text-brand hover:underline"
                    onClick={() => setBellOpen(false)}
                  >
                    Broadcasts
                  </Link>
                </div>
                <ul className="p-1.5">
                  {[
                    {
                      to: '/riders',
                      label: 'Rider applications',
                      value: alerts.riders,
                      icon: Bell,
                    },
                    {
                      to: '/withdrawals',
                      label: 'Withdrawals waiting',
                      value: alerts.withdrawals,
                      icon: ArrowDownToLine,
                    },
                    {
                      to: '/support',
                      label: 'Open support tickets',
                      value: alerts.support,
                      icon: LifeBuoy,
                    },
                    {
                      to: '/orders',
                      label: 'Review the order queue',
                      value: 0,
                      icon: ShoppingBag,
                    },
                  ].map((entry) => {
                    const Icon = entry.icon
                    return (
                      <li key={entry.to}>
                        <Link
                          to={entry.to}
                          onClick={() => setBellOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-surface-muted"
                        >
                          <Icon className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                          <span className="flex-1 text-ink">{entry.label}</span>
                          {entry.value > 0 ? (
                            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
                              {entry.value}
                            </span>
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                {alertTotal === 0 && (
                  <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">
                    Everything is clear right now.
                  </p>
                )}
              </div>
            )}
          </div>

          <Link
            to="/settings"
            aria-label="Settings"
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted transition hover:text-ink sm:flex"
          >
            <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>

          <Link
            to="/settings"
            className="ml-0.5 flex items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-1 pr-2.5 transition hover:border-ink/20"
            aria-label="Account settings"
          >
            <Avatar name={user?.name} size="sm" />
            <span className="hidden min-w-0 lg:block">
              <span className="block max-w-[120px] truncate text-xs font-semibold text-ink">
                {user?.name ?? 'Admin'}
              </span>
              <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                {user?.role ?? 'admin'}
              </span>
            </span>
          </Link>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-4 py-3 text-center text-[11px] text-ink-subtle">
          Swat City Food Delivery · Admin console ·{' '}
          <Link to="/settings" className="hover:text-ink">
            settings
          </Link>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
