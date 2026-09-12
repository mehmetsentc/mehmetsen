/**
 * LEFT "Haberi Aç" discovery affordance — Feed → Reader.
 * Interactive hit target (not pointer-events:none on the chip).
 *
 * V10: per-article Feed-session ownership.
 * Successful LEFT swipe / affordance on Card A must NOT globally suppress B/C/D.
 * Haberi Oku does NOT mark handled.
 *
 * Storage key v9 remains for diagnostic shownCount only — eligibility is session Set.
 */

export const SWIPE_DISCOVERY_STORAGE_KEY = 'nahaber.feedSwipeDiscovery.v10'
export const SWIPE_DISCOVERY_STORAGE_KEY_V9 = 'nahaber.feedSwipeDiscovery.v9'
export const SWIPE_DISCOVERY_STORAGE_KEY_V8 = 'nahaber.feedSwipeDiscovery.v8'
export const SWIPE_DISCOVERY_STORAGE_KEY_V7 = 'nahaber.feedSwipeDiscovery.v7'
export const SWIPE_DISCOVERY_STORAGE_KEY_V6 = 'nahaber.feedSwipeDiscovery.v6'
export const SWIPE_DISCOVERY_STORAGE_KEY_V5 = 'nahaber.feedSwipeDiscovery.v5'
export const SWIPE_DISCOVERY_STORAGE_KEY_V4 = 'nahaber.feedSwipeDiscovery.v4'
export const SWIPE_DISCOVERY_STORAGE_KEY_V3 = 'nahaber.feedSwipeDiscovery.v3'
export const SWIPE_DISCOVERY_STORAGE_KEY_V2 = 'nahaber.feedSwipeDiscovery.v2'
export const SWIPE_DISCOVERY_STORAGE_KEY_V1 = 'nahaber.feedSwipeDiscovery.v1'

export const SWIPE_DISCOVERY_SETTLE_MS = 500
export const SWIPE_DISCOVERY_TRAVEL_PX = 44
export const SWIPE_DISCOVERY_CARD_NUDGE_PX = 8
export const SWIPE_DISCOVERY_ANIM_MS = 900
/** Short one-shot demo — then hide (not a permanent overlay). */
export const SWIPE_DISCOVERY_HINT_MS = 4200
export const SWIPE_DISCOVERY_REPEAT_COUNT = 2
/** @deprecated Prefer SWIPE_DISCOVERY_CARD_NUDGE_PX */
export const SWIPE_DISCOVERY_NUDGE_PX = SWIPE_DISCOVERY_CARD_NUDGE_PX
/** Diagnostic only — must NOT gate eligibility. */
export const SWIPE_DISCOVERY_MAX_SHOWS = Number.MAX_SAFE_INTEGER

/** Bounded in-memory Feed-session ownership (no unbounded permanent list). */
export const FEED_COACH_SESSION_MAX_IDS = 64

export type SwipeDiscoveryState = {
  /** @deprecated Global learned no longer gates eligibility (kept for diagnostics). */
  learned: boolean
  shownCount: number
  version?: 10
}

export type SwipeDiscoveryPhase =
  | 'idle'
  | 'waiting'
  | 'visible'
  | 'animating'
  | 'done'
  | 'suppressed'
  | 'ineligible'

const sessionShownArticleIds = new Set<string>()
const sessionShownOrder: string[] = []

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
  if (!ss) return { learned: false, shownCount: 0, version: 10 }
  try {
    const raw = ss.getItem(SWIPE_DISCOVERY_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 10 }
    const parsed = JSON.parse(raw) as Partial<SwipeDiscoveryState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 10,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 10 }
  }
}

export function writeSwipeDiscoveryState(next: SwipeDiscoveryState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      SWIPE_DISCOVERY_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 10 })
    )
  } catch {
    // private mode / quota
  }
}

export function listFeedCoachSessionShownIds(): string[] {
  return [...sessionShownOrder]
}

export function hasFeedCoachShownForArticle(articleId: string): boolean {
  if (!articleId) return false
  return sessionShownArticleIds.has(articleId)
}

/** Mark this article's Feed coach handled for the current Feed session. */
export function markFeedCoachHandledForArticle(articleId: string): void {
  if (!articleId || sessionShownArticleIds.has(articleId)) return
  sessionShownArticleIds.add(articleId)
  sessionShownOrder.push(articleId)
  while (sessionShownOrder.length > FEED_COACH_SESSION_MAX_IDS) {
    const oldest = sessionShownOrder.shift()
    if (oldest) sessionShownArticleIds.delete(oldest)
  }
}

/**
 * Successful LEFT open for ONE article — session-scopes that card only.
 * Does NOT permanently disable coaches for other cards.
 */
export function markSwipeDiscoveryLearned(articleId?: string): void {
  if (articleId) markFeedCoachHandledForArticle(articleId)
  const cur = readSwipeDiscoveryState()
  // Diagnostic counter only — do not set learned=true as a global gate.
  writeSwipeDiscoveryState({ learned: false, shownCount: cur.shownCount, version: 10 })
}

export function resetSwipeDiscoveryPresentation(): void {
  sessionShownArticleIds.clear()
  sessionShownOrder.length = 0
  writeSwipeDiscoveryState({ learned: false, shownCount: 0, version: 10 })
}

/**
 * Eligible once per articleId during the current Feed session.
 * Global localStorage `learned` must NOT suppress later cards.
 */
export function shouldShowSwipeDiscoveryCoach(opts?: {
  articleId?: string
  state?: SwipeDiscoveryState
  maxShows?: number
}): boolean {
  void opts?.state
  void opts?.maxShows
  const articleId = opts?.articleId
  if (!articleId) return false
  return !sessionShownArticleIds.has(articleId)
}

export function recordSwipeDiscoveryShown(state?: SwipeDiscoveryState): SwipeDiscoveryState {
  const cur = state ?? readSwipeDiscoveryState()
  const next = { learned: false, shownCount: cur.shownCount + 1, version: 10 as const }
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
    SWIPE_DISCOVERY_STORAGE_KEY_V7,
    SWIPE_DISCOVERY_STORAGE_KEY_V8,
    SWIPE_DISCOVERY_STORAGE_KEY_V9,
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
  activeArticleId?: string | null
  feedCoachEligible?: boolean
  feedCoachShown?: boolean
}

let lastCoachDebug: SwipeCoachDebugSnapshot = {
  mounted: false,
  eligible: false,
  learned: false,
  shownCount: 0,
  phase: 'idle',
  leftCoachVisible: false,
  activeArticleId: null,
  feedCoachEligible: false,
  feedCoachShown: false,
}

export function publishSwipeCoachDebug(next: Partial<SwipeCoachDebugSnapshot>): void {
  lastCoachDebug = { ...lastCoachDebug, ...next }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nahaber-swipe-coach-debug'))
  }
}

export function readSwipeCoachDebug(): SwipeCoachDebugSnapshot {
  const s = readSwipeDiscoveryState()
  const id = lastCoachDebug.activeArticleId
  return {
    ...lastCoachDebug,
    learned: false,
    shownCount: s.shownCount,
    feedCoachEligible: id ? shouldShowSwipeDiscoveryCoach({ articleId: id }) : false,
    feedCoachShown: id ? hasFeedCoachShownForArticle(id) : false,
  }
}
