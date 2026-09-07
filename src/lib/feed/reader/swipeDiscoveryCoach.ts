/**
 * Device-local Swipe Discovery Coach for Feed → Reader LEFT swipe.
 * No DB, no analytics, no profile mutation.
 *
 * V4 key: human validation requires eligibility until a REAL LEFT→OPEN_READER
 * gesture. V1–V3 may have burned shownCount / learned while never human-visible;
 * those keys must NOT suppress V4.
 */

/** Current presentation store. */
export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v4'
/** Prior keys — diagnostic / migration proof only. */
export const SWIPE_DISCOVERY_STORAGE_KEY_V3 = 'nahaber.feedSwipeDiscovery.v3'
export const SWIPE_DISCOVERY_STORAGE_KEY_V2 = 'nahaber.feedSwipeDiscovery.v2'
export const SWIPE_DISCOVERY_STORAGE_KEY_V1 = 'nahaber.feedSwipeDiscovery.v1'
/** Wait after card settles before showing coach — design ~2s. */
export const SWIPE_DISCOVERY_SETTLE_MS = 1800
/** Finger/chip travel LEFT (px). */
export const SWIPE_DISCOVERY_TRAVEL_PX = 44
/** Subtle active-card nudge LEFT (px). */
export const SWIPE_DISCOVERY_CARD_NUDGE_PX = 8
/** Motion duration for travel + return half-cycle. */
export const SWIPE_DISCOVERY_ANIM_MS = 900
/** Total on-screen lifetime after settle (ms). */
export const SWIPE_DISCOVERY_HINT_MS = 2300
/** @deprecated Prefer SWIPE_DISCOVERY_CARD_NUDGE_PX */
export const SWIPE_DISCOVERY_NUDGE_PX = SWIPE_DISCOVERY_CARD_NUDGE_PX
/**
 * Soft periodic cap — V4 eligibility is primarily !learned.
 * High enough that normal cards remain eligible before gesture learning.
 */
export const SWIPE_DISCOVERY_MAX_SHOWS = 48

export type SwipeDiscoveryState = {
  learned: boolean
  shownCount: number
  version?: 4
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

/** Diagnostic only. */
export function readSwipeDiscoveryV1State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V1)
}

/** Diagnostic only. */
export function readSwipeDiscoveryV2State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V2)
}

/** Diagnostic only. */
export function readSwipeDiscoveryV3State(): SwipeDiscoveryState | null {
  return readLegacyState(SWIPE_DISCOVERY_STORAGE_KEY_V3)
}

export function readSwipeDiscoveryState(): SwipeDiscoveryState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0, version: 4 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 4 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 4,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 4 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      SWIPE_DISCOVERY_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 4 })
    )
  } catch {
    // private mode / quota
  }
}

export function markSwipeDiscoveryLearned(): void {
  const cur = readSwipeDiscoveryState()
  writeSwipeDiscoveryState({ learned: true, shownCount: cur.shownCount, version: 4 })
}

/** Presentation-only reset for ?readerDebug=1 Replay — does not touch capability/auth. */
export function resetSwipeDiscoveryPresentation(): void {
  writeSwipeDiscoveryState({ learned: false, shownCount: 0, version: 4 })
}

/**
 * Before learned: every normal Feed V2 card remains eligible.
 * shownCount is diagnostic / soft-cap only — do not permanently hide after a few mounts.
 */
export function shouldShowSwipeDiscoveryCoach(opts?: {
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readSwipeDiscoveryState()
  if (state.learned) return false
  const maxShows = opts?.maxShows ?? SWIPE_DISCOVERY_MAX_SHOWS
  return state.shownCount < maxShows
}

/**
 * Count a show ONLY after the coach has a real visible painted rect in viewport.
 * Scheduling / mount / rAF alone must not burn budget.
 */
export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1, version: 4 as const }
  writeSwipeDiscoveryState(next)
  return next
}

/** True when a painted element intersects the viewport with non-zero size. */
export function isCoachPaintedInViewport(el: Element | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return false
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  if (vw <= 0 || vh <= 0) return false
  return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
}

/**
 * Prior keys that would have suppressed older coaches — must not suppress V4.
 */
export function priorKeysWouldHaveSuppressedCoach(): boolean {
  for (const key of [
    SWIPE_DISCOVERY_STORAGE_KEY_V1,
    SWIPE_DISCOVERY_STORAGE_KEY_V2,
    SWIPE_DISCOVERY_STORAGE_KEY_V3,
  ]) {
    const s = readLegacyState(key)
    if (!s) continue
    if (s.learned || s.shownCount >= 3) return true
  }
  return false
}

/** @deprecated Prefer priorKeysWouldHaveSuppressedCoach */
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
