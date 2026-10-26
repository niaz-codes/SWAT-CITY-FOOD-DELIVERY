import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownToLine,
  BarChart3,
  Bell,
  Bike,
  Car,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  name: string
  to: string
  icon: LucideIcon
  description: string
  /** Which pending count the sidebar shows as a badge. */
  badge?: 'riders' | 'withdrawals' | 'support'
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        name: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        description: 'Live numbers, charts and what needs attention',
      },
      {
        name: 'Reports',
        to: '/reports',
        icon: BarChart3,
        description: 'Revenue, top restaurants and dishes by period',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        name: 'Orders',
        to: '/orders',
        icon: ShoppingBag,
        description: 'Advance status, assign riders and cancel orders',
      },
      {
        name: 'Rides',
        to: '/rides',
        icon: Car,
        description: 'Every ride request and its state',
      },
      {
        name: 'Riders',
        to: '/riders',
        icon: Bike,
        description: 'Approve, reject and suspend riders',
        badge: 'riders',
      },
      {
        name: 'Customers',
        to: '/customers',
        icon: Users,
        description: 'Accounts, verification and suspensions',
      },
    ],
  },
  {
    label: 'Catalog',
    items: [
      {
        name: 'Restaurants',
        to: '/restaurants',
        icon: Store,
        description: 'Create, edit, open or close a kitchen',
      },
      {
        name: 'Menu',
        to: '/menu',
        icon: UtensilsCrossed,
        description: 'Dishes, prices, availability and categories',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        name: 'Payments',
        to: '/payments',
        icon: CreditCard,
        description: 'Every payment attempt and gateway answer',
      },
      {
        name: 'Wallets',
        to: '/wallets',
        icon: Wallet,
        description: 'Balances and the transaction ledger',
      },
      {
        name: 'Withdrawals',
        to: '/withdrawals',
        icon: ArrowDownToLine,
        description: 'Approve, reject and mark rider payouts paid',
        badge: 'withdrawals',
      },
      {
        name: 'Promotions',
        to: '/promotions',
        icon: Tag,
        description: 'Coupon codes, limits and validity',
      },
    ],
  },
  {
    label: 'Engagement',
    items: [
      {
        name: 'Notifications',
        to: '/notifications',
        icon: Bell,
        description: 'Send a broadcast and read the history',
      },
      {
        name: 'Support',
        to: '/support',
        icon: LifeBuoy,
        description: 'Reply to tickets and move their status',
        badge: 'support',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        name: 'Settings',
        to: '/settings',
        icon: Settings,
        description: 'The values the app reads from the backend',
      },
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items)

export function navItemFor(pathname: string): NavItem | undefined {
  return (
    ALL_NAV.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ??
    ALL_NAV[0]
  )
}
