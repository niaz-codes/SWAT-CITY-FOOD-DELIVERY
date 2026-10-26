import type { BadgeTone } from '../components/ui/Badge'

/**
 * Formatting helpers for the admin panel.
 *
 * Currency mirrors the mobile app's helper (src/utils/format.ts) so the panel
 * and the app always show the same numbers in the same way.
 */
export function formatCurrency(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString('en-PK')}`
}

/** Rs 1.2L / Rs 45.3k for tight spaces. Real numbers, shorter notation. */
export function formatCompactCurrency(amount: number): string {
  const value = Math.round(amount)
  if (Math.abs(value) >= 10_000_000) return `Rs ${(value / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(value) >= 100_000) return `Rs ${(value / 100_000).toFixed(1)}L`
  if (Math.abs(value) >= 10_000) return `Rs ${(value / 1_000).toFixed(1)}k`
  return formatCurrency(value)
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-PK')
}

/** A date, e.g. "21 Oct 2026". */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** A date with the time, e.g. "21 Oct 2026, 17:42". */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${formatDate(value)}, ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** "3m ago", "2h ago", "5d ago" - for live feeds where exact clock time is noise. */
export function timeAgo(value?: string | Date | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1m ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

/**
 * The badge tone for a status word.
 *
 * The API answers with plain words (`open`, `pending`, `delivered`, `failed`),
 * so the panel colours them instead of printing them raw.
 */
export function statusTone(status?: string | null): BadgeTone {
  const value = (status ?? '').toLowerCase()
  if (
    [
      'active',
      'approved',
      'open',
      'delivered',
      'completed',
      'paid',
      'sent',
      'verified',
      'confirmed',
      'online',
      'resolved',
    ].includes(value)
  ) {
    return 'success'
  }
  if (
    [
      'pending',
      'preparing',
      'ready',
      'processing',
      'busy',
      'rider_assigned',
      'picked_up',
      'in_progress',
      'approved_pending',
    ].includes(value)
  ) {
    return 'warning'
  }
  if (
    [
      'on_the_way',
      'assigned',
      'in_transit',
      'searching',
      'accepted',
      'arriving',
      'started',
    ].includes(value)
  ) {
    return 'info'
  }
  if (
    [
      'cancelled',
      'failed',
      'rejected',
      'suspended',
      'expired',
      'refunded',
      'inactive',
      'offline',
      'closed',
    ].includes(value)
  ) {
    return 'danger'
  }
  return 'neutral'
}

/** "rider_assigned" reads better as "Rider assigned". */
export function humanizeStatus(status?: string | null): string {
  if (!status) return '-'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A percentage that never divides by zero. */
export function percent(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

/** 12 - 3 = 9, but also 2 - 5 = -3: the change used for KPI trends. */
export function changePercent(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}
