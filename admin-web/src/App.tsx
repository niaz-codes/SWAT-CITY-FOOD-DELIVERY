import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { UtensilsCrossed } from 'lucide-react'
import { useAuthStore } from './stores/authStore'
import { startSystemThemeSync, useThemeStore } from './stores/themeStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Rides from './pages/Rides'
import Restaurants from './pages/Restaurants'
import Menu from './pages/Menu'
import Riders from './pages/Riders'
import Customers from './pages/Customers'
import Payments from './pages/Payments'
import Wallets from './pages/Wallets'
import Withdrawals from './pages/Withdrawals'
import Promotions from './pages/Promotions'
import Notifications from './pages/Notifications'
import Support from './pages/Support'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import AdminLayout from './layouts/AdminLayout'
import PortalLayout from './layouts/PortalLayout'
import PortalOrders from './pages/portal/PortalOrders'
import PortalMenu from './pages/portal/PortalMenu'
import PortalProfile from './pages/portal/PortalProfile'
import { homeForRole, isPanelRole } from './stores/authStore'

/** A branded splash while the stored session is being checked. */
function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <span className="flex h-14 w-14 animate-breathe items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-strong text-brand-contrast shadow-pop">
        <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="text-center">
        <p className="text-sm font-semibold text-ink">Swat City admin</p>
        <p className="mt-0.5 text-xs text-ink-muted">Checking your session…</p>
      </div>
    </div>
  )
}

function ProtectedRoute({
  children,
  allowed = ['admin'],
}: {
  children: ReactNode
  /** Roles this subtree serves; anything else is bounced to its own home. */
  allowed?: readonly string[]
}) {
  const { user, loading } = useAuthStore()

  if (loading) return <Splash />

  // Not signed in: straight to the login.
  if (!user || !isPanelRole(user.role)) {
    return <Navigate to="/login" replace />
  }

  // Signed in as one panel role but poking at the other's pages - send them
  // home rather than to a login they already passed.
  if (!allowed.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />
  }

  return <>{children}</>
}

/** Every route change starts at the top of the new screen. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

/** Unknown paths go to the home page of whichever role is signed in. */
function RoleHomeRedirect() {
  const { user, loading } = useAuthStore()
  if (loading) return <Splash />
  return <Navigate to={homeForRole(user?.role)} replace />
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * A render error should show a way out instead of a blank white page - the
 * admin still has a working browser and can reload.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only log channel the static site has.
    console.error('Admin panel render error', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
          <h1 className="text-lg font-bold text-ink">Something broke on this screen</h1>
          <p className="max-w-sm text-sm text-ink-muted">
            The rest of the panel is fine. Reload to get back to a clean state.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast"
          >
            Reload the panel
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const theme = useThemeStore((state) => state.theme)
  const checkAuth = useAuthStore((state) => state.checkAuth)

  useEffect(() => {
    void checkAuth()
    return startSystemThemeSync()
  }, [checkAuth])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* The restaurant-owner portal: same app, different layout. */}
          <Route
            path="/portal"
            element={
              <ProtectedRoute allowed={['restaurant']}>
                <PortalLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/portal/orders" replace />} />
            <Route path="orders" element={<PortalOrders />} />
            <Route path="menu" element={<PortalMenu />} />
            <Route path="profile" element={<PortalProfile />} />
          </Route>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="rides" element={<Rides />} />
            <Route path="restaurants" element={<Restaurants />} />
            <Route path="menu" element={<Menu />} />
            <Route path="riders" element={<Riders />} />
            <Route path="customers" element={<Customers />} />
            <Route path="payments" element={<Payments />} />
            <Route path="wallets" element={<Wallets />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="support" element={<Support />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<RoleHomeRedirect />} />
        </Routes>
        <Toaster
          position="top-right"
          theme={theme}
          richColors
          closeButton
          toastOptions={{
            style: {
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--line))',
              color: 'rgb(var(--ink))',
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
