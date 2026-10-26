/**
 * Types for the restaurant-owner portal (`/portal/*`).
 *
 * They mirror the shapes the backend portal controller answers with
 * (`backend/src/controllers/restaurantPortal.controller.ts`) — deliberately in
 * one place, because Orders, Menu and Profile all read from `/restaurant/me`
 * through the layout's context.
 */
import type { BadgeTone } from '../components/ui/Badge'

export type RestaurantStatus = 'closed' | 'open' | 'busy'

export interface PortalRestaurant {
  _id: string
  name: string
  slug?: string | null
  description?: string | null
  cuisine?: string | null
  category?: string | null
  tags: string[]
  status: RestaurantStatus
  isApproved: boolean
  featured: boolean
  rating: number
  reviewCount: number
  deliveryTimeMin: number
  deliveryFee: number
  minOrder: number
  freeDelivery: boolean
  promo?: string | null
  imageUrl?: string | null
  imagePublicId?: string | null
  emoji?: string | null
  gradient: string[]
  ownerName?: string | null
  phone?: string | null
  addressLine?: string | null
  area?: string | null
  hours: { open?: string | null; close?: string | null }
  /** [lng, lat] - the GeoJSON point `PATCH /restaurant/me` builds from lat/lng. */
  location?: { type?: string; coordinates?: number[] } | null
  createdAt: string
  updatedAt: string
}

export interface PortalOwner {
  _id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  avatarUrl?: string | null
  verified?: boolean | null
}

export interface PortalStats {
  pendingOrders: number
  activeOrders: number
  todayOrders: number
  todayRevenue: number
  menuCount: number
}

/** One of the global menu categories food items file under. */
export interface PortalMenuCategory {
  _id: string
  name: string
  emoji?: string | null
  sortOrder?: number | null
}

export interface PortalMenuItem {
  _id: string
  restaurant: string
  name: string
  description?: string | null
  category?: string | null
  price: number
  emoji?: string | null
  imageUrl?: string | null
  gradient: string[]
  rating: number
  reviewCount: number
  calories?: number | null
  prepMin?: number | null
  popular: boolean
  available: boolean
  isVeg: boolean
  createdAt: string
  updatedAt: string
}

export interface PortalOrderItem {
  name: string
  quantity: number
  price: number
  emoji?: string | null
  note?: string | null
}

export interface PortalOrderStatusEvent {
  status?: string | null
  note?: string | null
  at?: string | null
}

/** The rider row, as populated by the orders list (name/phone/avatarUrl only). */
export interface PortalOrderRider {
  _id: string
  name?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

export interface PortalOrder {
  _id: string
  orderNumber?: string | null
  customer: string
  restaurant: string
  /** Populated rider object, or the raw id when there is none yet. */
  rider?: PortalOrderRider | string | null
  items: PortalOrderItem[]
  status: string
  statusHistory: PortalOrderStatusEvent[]
  addressSnapshot?: {
    full?: string | null
    area?: string | null
    tag?: string | null
    lat?: number | null
    lng?: number | null
  } | null
  subtotal: number
  deliveryFee: number
  discount: number
  platformFee: number
  total: number
  paymentMethod: string
  paymentStatus: string
  note?: string | null
  cancelReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface PortalMePayload {
  restaurant: PortalRestaurant
  owner: PortalOwner
  stats: PortalStats
}

/** The value `PortalLayout` exposes to its pages through the outlet context. */
export interface PortalContextValue {
  data: PortalMePayload | null
  loading: boolean
  error: string
  refreshMe: () => void
}

/** The lifecycle steps only the restaurant itself can trigger. */
export const RESTAURANT_ACTIONS: Record<string, { next: string; label: string }> = {
  pending: { next: 'confirmed', label: 'Confirm order' },
  confirmed: { next: 'preparing', label: 'Start preparing' },
  preparing: { next: 'ready', label: 'Mark ready' },
}

/** Order statuses an owner may still cancel (the backend enforces the same list). */
export const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'preparing']

/** Human words for the order statuses an owner sees. */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'New order'
    case 'rider_assigned':
      return 'Rider assigned'
    case 'picked_up':
      return 'Picked up'
    case 'on_the_way':
      return 'On the way'
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

/** Badge colour for an order status, matching the admin panel vocabulary. */
export function orderStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'confirmed':
    case 'preparing':
    case 'ready':
      return 'info'
    case 'rider_assigned':
    case 'picked_up':
    case 'on_the_way':
      return 'brand'
    case 'delivered':
      return 'success'
    case 'cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}
