/**
 * Device-local Swipe Discovery Coach for Feed → Reader LEFT swipe.
 * No DB, no analytics, no profile mutation.
 *
 * V2 key: Production V1 state often already had learned/maxShows from the weak
 * coach — that permanently hid the improved coach for real users.
 * V1 is intentionally NOT migrated as "learned".
 */

/** Current presentation store — do not reuse V1 learned/max for the new UX. */
export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v2'
/** Legacy key (b51fb4d and earlier) — read only for migration diagnostics. */
export const SWIPE_DISCOVERY_STORAGE_KEY_V1 = 'nahaber.feedSwipeDiscovery.v1'
/** Total on-screen lifetime after settle (ms). */
export const SWIPE_DISCOVERY_HINT_MS = 2200
/** Wait after card settles before showing coach. */
export const SWIPE_DISCOVERY_SETTLE_MS = 1700
/** Finger/chip travel LEFT (px). */
export const SWIPE_DISCOVERY_TRAVEL_PX = 42
/** Subtle active-card nudge LEFT (px). */
export const SWIPE_DISCOVERY_CARD_NUDGE_PX = 10
/** Motion duration for travel + return half-cycle. */
export const SWIPE_DISCOVERY_ANIM_MS = 900
/** @deprecated Prefer SWIPE_DISCOVERY_CARD_NUDGE_PX */
export const SWIPE_DISCOVERY_NUDGE_PX = SWIPE_DISCOVERY_CARD_NUDGE_PX
export const SWIPE_DISCOVERY_MAX_SHOWS = 3

export type SwipeDiscoveryState = {
  learned: boolean
  shownCount: number
  version?: 2
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/** Diagnostic only — proves whether V1 suppressed the old coach for this device. */
export function readSwipeDiscoveryV1State(): SwipeDiscoveryState | null {
  const ss = storage()
  if (!ss) return null
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY_V1)
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
  if (!ss) return { learned: false, shownCount: 0, version: 2 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 2 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 2,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 2 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      SWIPE_DISCOVERY_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 2 })
    )
  } catch {
    // private mode / quota
  }
}

export function markSwipeDiscoveryLearned(): void {
  const cur = readSwipeDiscoveryState()
  writeSwipeDiscoveryState({ learned: true, shownCount: cur.shownCount, version: 2 })
}

/** Presentation-only reset for ?readerDebug=1 Replay — does not touch capability/auth. */
export function resetSwipeDiscoveryPresentation(): void {
  writeSwipeDiscoveryState({ learned: false, shownCount: 0, version: 2 })
}

/** Show at most a few times before the user learns via LEFT open. */
export function shouldShowSwipeDiscoveryCoach(opts?: {
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readSwipeDiscoveryState()
  const maxShows = opts?.maxShows ?? SWIPE_DISCOVERY_MAX_SHOWS
  if (state.learned) return false
  return state.shownCount < maxShows
}

export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1, version: 2 as const }
  writeSwipeDiscoveryState(next)
  return next
}

/**
 * V1→V2: V1 learned/max must NOT suppress V2. Fresh V2 starts until LEFT learn.
 * Returns whether a V1 payload existed that would have hidden the coach.
 */
export function v1WouldHaveSuppressedCoach(): boolean {
  const v1 = readSwipeDiscoveryV1State()
  if (!v1) return false
  if (v1.learned) return true
  return v1.shownCount >= SWIPE_DISCOVERY_MAX_SHOWS
}
