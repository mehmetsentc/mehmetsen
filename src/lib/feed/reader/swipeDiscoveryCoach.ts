/**
 * Device-local Swipe Discovery Coach for Feed → Reader LEFT swipe.
 * No DB, no analytics, no profile mutation.
 *
 * V5: V4 could burn shownCount while painted under social rail (z-22 < z-30)
 * or cancel settle on snap. Fresh key + higher stack + left-of-center placement.
 * Prior V1–V4 learned/max must NOT suppress V5.
 */

/** Current presentation store. */
export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v5'
export const SWIPE_DISCOVERY_STORAGE_KEY_V4 = 'nahaber.feedSwipeDiscovery.v4'
export const SWIPE_DISCOVERY_STORAGE_KEY_V3 = 'nahaber.feedSwipeDiscovery.v3'
export const SWIPE_DISCOVERY_STORAGE_KEY_V2 = 'nahaber.feedSwipeDiscovery.v2'
export const SWIPE_DISCOVERY_STORAGE_KEY_V1 = 'nahaber.feedSwipeDiscovery.v1'
/** Wait after card settles before showing coach. */
export const SWIPE_DISCOVERY_SETTLE_MS = 1600
/** Finger/chip travel LEFT (px). */
export const SWIPE_DISCOVERY_TRAVEL_PX = 44
/** Subtle active-card nudge LEFT (px). */
export const SWIPE_DISCOVERY_CARD_NUDGE_PX = 8
/** Motion duration for one travel half-cycle. */
export const SWIPE_DISCOVERY_ANIM_MS = 900
/** Total on-screen lifetime after settle (includes one repeat). */
export const SWIPE_DISCOVERY_HINT_MS = 4200
/** How many travel cycles while visible. */
export const SWIPE_DISCOVERY_REPEAT_COUNT = 2
/** @deprecated Prefer SWIPE_DISCOVERY_CARD_NUDGE_PX */
export const SWIPE_DISCOVERY_NUDGE_PX = SWIPE_DISCOVERY_CARD_NUDGE_PX
export const SWIPE_DISCOVERY_MAX_SHOWS = 48

export type SwipeDiscoveryState = {
  learned: boolean
  shownCount: number
  version?: 5
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

export function readSwipeDiscoveryV1State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V1)
}

export function readSwipeDiscoveryV2State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V2)
}

export function readSwipeDiscoveryV3State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V3)
}

export function readSwipeDiscoveryV4State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V4)
}

export function readSwipeDiscoveryState(): SwipeDiscoveryState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0, version: 5 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 5 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 5,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 5 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      SWIPE_DISCOVERY_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 5 })
    )
  } catch {
    // private mode / quota
  }
}

export function markSwipeDiscoveryLearned(): void {
  const cur = readSwipeDiscoveryState()
  writeSwipeDiscoveryState({ learned: true, shownCount: cur.shownCount, version: 5 })
}

export function resetSwipeDiscoveryPresentation(): void {
  writeSwipeDiscoveryState({ learned: false, shownCount: 0, version: 5 })
}

export function shouldShowSwipeDiscoveryCoach(opts?: {
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readSwipeDiscoveryState()
  if (state.learned) return false
  const maxShows = opts?.maxShows ?? SWIPE_DISCOVERY_MAX_SHOWS
  return state.shownCount < maxShows
}

export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1, version: 5 as const }
  writeSwipeDiscoveryState(next)
  return next
}

/** True when painted rect intersects viewport with non-zero size. */
export function isCoachPaintedInViewport(el: Element | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return false
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  if (vw <= 0 || vh <= 0) return false
  if (!(r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw)) return false

  // Reject when social dock (or other chrome) sits on top of the coach center.
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
      // First non-coach hit that isn't transparent chrome — if it's social, already returned.
      // If coach isn't first, keep scanning until coach or social.
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
