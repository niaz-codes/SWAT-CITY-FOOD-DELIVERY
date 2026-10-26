/**
 * New-order alert support for the restaurant portal.
 *
 * The kitchen queue polls every 20 s (PortalOrders). When a poll returns
 * pending orders that were not in the previous snapshot we play a short chime,
 * raise a toast and (when the browser allows) a desktop notification.
 *
 * The "last seen" snapshot lives at module level on purpose: navigating between
 * portal pages unmounts the orders page, and without the module state every
 * return to Orders would replay the chime for orders the owner has already
 * seen (and probably already confirmed).
 */

/** How long an order keeps its "NEW" pill after it first appears. */
export const FRESH_WINDOW_MS = 3 * 60 * 1000

const PREF_KEY = 'portal.soundAlerts'

let lastPendingIds: string[] = []
const freshSince = new Map<string, number>()

/** Alerts are on unless the owner turned them off. */
export function soundAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundAlerts(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Private mode without storage: alerts just stay in-memory.
  }
}

/** Ask the browser for desktop-notification permission (must happen in a click). */
export async function requestAlertPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** A two-note chime through WebAudio — no bundled sound file, no autoplay abuse. */
function playChime(): void {
  try {
    type Ctx = typeof AudioContext
    const holder = window as unknown as { AudioContext?: Ctx; webkitAudioContext?: Ctx }
    const CtxCtor = holder.AudioContext ?? holder.webkitAudioContext
    if (!CtxCtor) return
    const ctx = new CtxCtor()
    const notes: Array<[number, number]> = [
      [880, 0],
      [1174.66, 0.16],
    ]
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + at
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.32)
    }
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined)
    }, 900)
  } catch {
    // No audio available — the toast and desktop notification still fire.
  }
}

function desktopNotify(count: number): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification(`🍲 ${count} new order${count === 1 ? '' : 's'}`, {
      body: 'Open the orders page to confirm.',
      tag: 'swat-portal-orders',
    })
  } catch {
    // Some browsers throw even with permission granted — never break the poll.
  }
}

export interface Announcement {
  /** Order ids that arrived with this poll (they get the NEW pill). */
  freshIds: string[]
  /** True when a chime/toast/notification actually fired for this poll. */
  announced: boolean
}

/**
 * Feed in the ids of currently-pending orders after every poll.
 *
 * The very first call only records a baseline — an owner who opens the panel to
 * two waiting orders should not be greeted by an alarm for them.
 */
export function announcePendingOrders(pendingIds: string[]): Announcement {
  const now = Date.now()
  for (const [id, at] of freshSince) {
    if (now - at > FRESH_WINDOW_MS) freshSince.delete(id)
  }
  const freshIds = pendingIds.filter(
    (id) => id && !lastPendingIds.includes(id) && !freshSince.has(id),
  )
  // Empty lastSeen + empty fresh set == this tab just loaded.
  const baseline = lastPendingIds.length === 0
  for (const id of freshIds) freshSince.set(id, now)
  lastPendingIds = [...pendingIds]

  if (baseline || freshIds.length === 0) {
    return { freshIds: baseline ? [] : freshIds, announced: false }
  }
  if (soundAlertsEnabled()) playChime()
  desktopNotify(freshIds.length)
  return { freshIds, announced: true }
}

/** Ids recent enough to still deserve the NEW pill. */
export function freshOrderIds(): string[] {
  const now = Date.now()
  const ids: string[] = []
  for (const [id, at] of freshSince) {
    if (now - at <= FRESH_WINDOW_MS) ids.push(id)
    else freshSince.delete(id)
  }
  return ids
}
