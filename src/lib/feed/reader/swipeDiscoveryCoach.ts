/**
 * RIGHT "Haberi Aç" discovery affordance — Feed → Reader.
 * Interactive hit target (not pointer-events:none on the chip).
 * Learned only after successful RIGHT swipe OR affordance TAP.
 * Haberi Oku does NOT mark learned.
 *
 * V7: open direction flipped to RIGHT (human product decision).
 * Eligibility is !learned only — shownCount is diagnostic.
 */

export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v7'
export const SWIPE_DISCOVERY_STORAGE_KEY_V6 = 'nahaber.feedSwipeDiscovery.v6'
export const SWIPE_DISCOVERY_STORAGE_KEY_V5 = 'nahaber.feedSwipeDiscovery.v5'
export const SWIPE_DISCOVERY_STORAGE_KEY_V4 = 'nahaber.feedSwipeDiscovery.v4'
export const SWIPE_DISCOVERY_STORAGE_KEY_V3 = 'nahaber.feedSwipeDiscovery.v3'
export const SWIPE_DISCOVERY_STORAGE_KEY_V2 = 'nahaber.feedSwipeDiscovery.v2'
export const SWIPE_DISCOVERY_STORAGE_KEY_V1 = 'nahaber.feedSwipeDiscovery.v1'

export const SWIPE_DISCOVERY_SETTLE_MS = 1400
export const SWIPE_DISCOVERY_TRAVEL_PX = 44
export const SWIPE_DISCOVERY_CARD_NUDGE_PX = 8
export const SWIPE_DISCOVERY_ANIM_MS = 900
/** Stay visible after motion cycles (soft rest) — do not vanish before user can act. */
export const SWIPE_DISCOVERY_HINT_MS = 7200
export const SWIPE_DISCOVERY_REPEAT_COUNT = 2
/** @deprecated Prefer SWIPE_DISCOVERY_CARD_NUDGE_PX */
export const SWIPE_DISCOVERY_NUDGE_PX = SWIPE_DISCOVERY_CARD_NUDGE_PX
/** Diagnostic only — must NOT gate eligibility before learned. */
export const SWIPE_DISCOVERY_MAX_SHOWS = Number.MAX_SAFE_INTEGER

export type SwipeDiscoveryState = {
  learned: boolean
  shownCount: number
  version?: 7
}

export type SwipeDiscoveryPhase =
  | 'idle'
  | 'waiting'
  | 'visible'
  | 'animating'
  | 'done'
  | 'suppressed'
  | 'ineligible'

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readLegacyState(key: string): SwipeDiscoveryState | null {
  const ss = storage()
  if (!ss) return null
  try {
    const raw = ss.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
    }
  } catch {
    return null
  }
}

export function readSwipeDiscoveryState(): SwipeDiscoveryState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0, version: 7 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 7 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 7,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 7 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      SWIPE_DISCOVERY_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 7 })
    )
  } catch {
    // private mode / quota
  }
}

export function markSwipeDiscoveryLearned(): void {
  const cur = readSwipeDiscoveryState()
  writeSwipeDiscoveryState({ learned: true, shownCount: cur.shownCount, version: 7 })
}

export function resetSwipeDiscoveryPresentation(): void {
  writeSwipeDiscoveryState({ learned: false, shownCount: 0, version: 7 })
}

/** Eligible until REAL right-open learn (swipe or affordance tap). shown ≠ learned. */
export function shouldShowSwipeDiscoveryCoach(opts?: {
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readSwipeDiscoveryState()
  void opts?.maxShows
  return !state.learned
}

export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1, version: 7 as const }
  writeSwipeDiscoveryState(next)
  return next
}

export function isCoachPaintedInViewport(el: Element | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return false
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  if (vw <= 0 || vh <= 0) return false
  if (!(r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw)) return false

  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const stack = document.elementsFromPoint(cx, cy)
    for (const hit of stack) {
      if (hit === el || el.contains(hit)) return true
      if (
        hit instanceof Element &&
        (hit.getAttribute('data-testid') === 'smart-feed-social-dock' ||
          hit.closest('[data-testid="smart-feed-social-dock"]'))
      ) {
        return false
      }
    }
  }
  return true
}

export function priorKeysWouldHaveSuppressedCoach(): boolean {
  for (const key of [
    SWIPE_DISCOVERY_STORAGE_KEY_V1,
    SWIPE_DISCOVERY_STORAGE_KEY_V2,
    SWIPE_DISCOVERY_STORAGE_KEY_V3,
    SWIPE_DISCOVERY_STORAGE_KEY_V4,
    SWIPE_DISCOVERY_STORAGE_KEY_V5,
    SWIPE_DISCOVERY_STORAGE_KEY_V6,
  ]) {
    const s = readLegacyState(key)
    if (!s) continue
    if (s.learned || s.shownCount >= 3) return true
  }
  return false
}

export function v1WouldHaveSuppressedCoach(): boolean {
  return priorKeysWouldHaveSuppressedCoach()
}

export type SwipeCoachDebugSnapshot = {
  mounted: boolean
  eligible: boolean
  learned: boolean
  shownCount: number
  phase: SwipeDiscoveryPhase
  leftCoachVisible?: boolean
}

let lastCoachDebug: SwipeCoachDebugSnapshot = {
  mounted: false,
  eligible: false,
  learned: false,
  shownCount: 0,
  phase: 'idle',
  leftCoachVisible: false,
}

export function publishSwipeCoachDebug(next: Partial<SwipeCoachDebugSnapshot>): void {
  lastCoachDebug = { ...lastCoachDebug, ...next }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nahaber-swipe-coach-debug'))
  }
}

export function readSwipeCoachDebug(): SwipeCoachDebugSnapshot {
  const s = readSwipeDiscoveryState()
  return {
    ...lastCoachDebug,
    learned: s.learned,
    shownCount: s.shownCount,
  }
}
