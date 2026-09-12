/**
 * RIGHT "Akışa Dön" return affordance — Reader → Feed.
 * Interactive hit target.
 *
 * V6: per Reader article/generation session ownership.
 * Successful RIGHT return from Reader A must NOT permanently suppress Reader B.
 * Back Arrow does NOT mark handled.
 */

export const READER_RETURN_COACH_STORAGE_KEY = 'nahaber.readerReturnCoach.v6'
export const READER_RETURN_COACH_STORAGE_KEY_V5 = 'nahaber.readerReturnCoach.v5'
export const READER_RETURN_COACH_STORAGE_KEY_V4 = 'nahaber.readerReturnCoach.v4'
export const READER_RETURN_COACH_STORAGE_KEY_V3 = 'nahaber.readerReturnCoach.v3'
export const READER_RETURN_COACH_STORAGE_KEY_V2 = 'nahaber.readerReturnCoach.v2'
export const READER_RETURN_COACH_STORAGE_KEY_V1 = 'nahaber.readerReturnCoach.v1'
export const READER_RETURN_COACH_SETTLE_MS = 1500
export const READER_RETURN_COACH_TRAVEL_PX = 44
export const READER_RETURN_COACH_ANIM_MS = 900
export const READER_RETURN_COACH_HINT_MS = 4200
export const READER_RETURN_COACH_REPEAT_COUNT = 2
export const READER_RETURN_COACH_MAX_SHOWS = Number.MAX_SAFE_INTEGER
export const READER_COACH_SESSION_MAX_KEYS = 64

export type ReaderReturnCoachState = {
  /** @deprecated Global learned no longer gates eligibility. */
  learned: boolean
  shownCount: number
  version?: 6
}

export type ReaderReturnCoachPhase =
  | 'idle'
  | 'waiting'
  | 'visible'
  | 'animating'
  | 'done'
  | 'suppressed'
  | 'ineligible'

const sessionShownKeys = new Set<string>()
const sessionShownOrder: string[] = []

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readerCoachScopeKey(opts: {
  articleId: string
  generation?: number | null
}): string {
  const gen = opts.generation ?? 0
  return `${opts.articleId}#${gen}`
}

export function readReaderReturnCoachState(): ReaderReturnCoachState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0, version: 6 }
  try {
    const raw = ss.getItem(READER_RETURN_COACH_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 6 }
    const parsed = JSON.parse(raw) as Partial<ReaderReturnCoachState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 6,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 6 }
  }
}

export function writeReaderReturnCoachState(next: ReaderReturnCoachState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      READER_RETURN_COACH_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 6 })
    )
  } catch {
    // private mode / quota
  }
}

export function hasReaderCoachShownForScope(scopeKey: string): boolean {
  if (!scopeKey) return false
  return sessionShownKeys.has(scopeKey)
}

export function markReaderCoachHandledForScope(scopeKey: string): void {
  if (!scopeKey || sessionShownKeys.has(scopeKey)) return
  sessionShownKeys.add(scopeKey)
  sessionShownOrder.push(scopeKey)
  while (sessionShownOrder.length > READER_COACH_SESSION_MAX_KEYS) {
    const oldest = sessionShownOrder.shift()
    if (oldest) sessionShownKeys.delete(oldest)
  }
}

/**
 * Successful RIGHT return for ONE Reader generation — does not globally suppress others.
 */
export function markReaderReturnCoachLearned(scopeKey?: string): void {
  if (scopeKey) markReaderCoachHandledForScope(scopeKey)
  const cur = readReaderReturnCoachState()
  writeReaderReturnCoachState({ learned: false, shownCount: cur.shownCount, version: 6 })
}

export function resetReaderReturnCoachPresentation(): void {
  sessionShownKeys.clear()
  sessionShownOrder.length = 0
  writeReaderReturnCoachState({ learned: false, shownCount: 0, version: 6 })
}

export function shouldShowReaderReturnCoach(opts?: {
  articleId?: string
  generation?: number | null
  scopeKey?: string
  state?: ReaderReturnCoachState
  maxShows?: number
}): boolean {
  void opts?.state
  void opts?.maxShows
  const key =
    opts?.scopeKey ??
    (opts?.articleId
      ? readerCoachScopeKey({ articleId: opts.articleId, generation: opts.generation })
      : '')
  if (!key) return false
  return !sessionShownKeys.has(key)
}

export function recordReaderReturnCoachShown(state?: ReaderReturnCoachState): ReaderReturnCoachState {
  const cur = state ?? readReaderReturnCoachState()
  const next = { learned: false, shownCount: cur.shownCount + 1, version: 6 as const }
  writeReaderReturnCoachState(next)
  return next
}

export type ReaderReturnCoachDebugSnapshot = {
  mounted: boolean
  eligible: boolean
  learned: boolean
  shownCount: number
  phase: ReaderReturnCoachPhase
  rightCoachVisible?: boolean
  readerGeneration?: number | null
  readerCoachEligible?: boolean
  readerCoachShown?: boolean
  scopeKey?: string | null
}

let lastDebug: ReaderReturnCoachDebugSnapshot = {
  mounted: false,
  eligible: false,
  learned: false,
  shownCount: 0,
  phase: 'idle',
  rightCoachVisible: false,
  readerGeneration: null,
  readerCoachEligible: false,
  readerCoachShown: false,
  scopeKey: null,
}

export function publishReaderReturnCoachDebug(next: Partial<ReaderReturnCoachDebugSnapshot>): void {
  lastDebug = { ...lastDebug, ...next }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nahaber-reader-return-coach-debug'))
  }
}

export function readReaderReturnCoachDebug(): ReaderReturnCoachDebugSnapshot {
  const s = readReaderReturnCoachState()
  const key = lastDebug.scopeKey
  return {
    ...lastDebug,
    learned: false,
    shownCount: s.shownCount,
    readerCoachEligible: key ? shouldShowReaderReturnCoach({ scopeKey: key }) : false,
    readerCoachShown: key ? hasReaderCoachShownForScope(key) : false,
  }
}
