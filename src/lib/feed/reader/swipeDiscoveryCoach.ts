/**
 * Device-local Swipe Discovery Coach for Feed → Reader LEFT swipe.
 * No DB, no analytics, no profile mutation.
 */

export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v1'
export const SWIPE_DISCOVERY_HINT_MS = 1800
export const SWIPE_DISCOVERY_NUDGE_PX = 10

export type SwipeDiscoveryState = {
  learned: boolean
  shownCount: number
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readSwipeDiscoveryState(): SwipeDiscoveryState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
    }
  } catch {
    return { learned: false, shownCount: 0 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(SWIPE_DISCOVERY_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // private mode / quota
  }
}

export function markSwipeDiscoveryLearned(): void {
  const cur = readSwipeDiscoveryState()
  writeSwipeDiscoveryState({ learned: true, shownCount: cur.shownCount })
}

/** Show at most a few times before the user learns via LEFT open. */
export function shouldShowSwipeDiscoveryCoach(opts?: {
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readSwipeDiscoveryState()
  const maxShows = opts?.maxShows ?? 3
  if (state.learned) return false
  return state.shownCount < maxShows
}

export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1 }
  writeSwipeDiscoveryState(next)
  return next
}
