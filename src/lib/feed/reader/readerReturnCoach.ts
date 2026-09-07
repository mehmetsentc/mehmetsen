/**
 * Device-local RIGHT-swipe return coach inside FeedArticleReader.
 * Presentation only — never owns history/gestures.
 * No DB / analytics / profile mutation.
 */

export const READER_RETURN_COACH_STORAGE_KEY = 'nahaber.readerReturnCoach.v1'
export const READER_RETURN_COACH_SETTLE_MS = 1800
export const READER_RETURN_COACH_TRAVEL_PX = 44
export const READER_RETURN_COACH_ANIM_MS = 900
export const READER_RETURN_COACH_HINT_MS = 2300
export const READER_RETURN_COACH_MAX_SHOWS = 48

export type ReaderReturnCoachState = {
  learned: boolean
  shownCount: number
  version?: 1
}

export type ReaderReturnCoachPhase =
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

export function readReaderReturnCoachState(): ReaderReturnCoachState {
  const ss = storage()
  if (!ss) return { learned: false, shownCount: 0, version: 1 }
  try {
    const raw = ss.getItem(READER_RETURN_COACH_STORAGE_KEY)
    if (!raw) return { learned: false, shownCount: 0, version: 1 }
    const parsed = JSON.parse(raw) as Partial<ReaderReturnCoachState>
    return {
      learned: Boolean(parsed.learned),
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      version: 1,
    }
  } catch {
    return { learned: false, shownCount: 0, version: 1 }
  }
}

export function writeReaderReturnCoachState(next: ReaderReturnCoachState): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      READER_RETURN_COACH_STORAGE_KEY,
      JSON.stringify({ learned: next.learned, shownCount: next.shownCount, version: 1 })
    )
  } catch {
    // private mode / quota
  }
}

/** Only successful RIGHT gesture → Feed may mark learned. Back arrow must not. */
export function markReaderReturnCoachLearned(): void {
  const cur = readReaderReturnCoachState()
  writeReaderReturnCoachState({ learned: true, shownCount: cur.shownCount, version: 1 })
}

export function resetReaderReturnCoachPresentation(): void {
  writeReaderReturnCoachState({ learned: false, shownCount: 0, version: 1 })
}

export function shouldShowReaderReturnCoach(opts?: {
  state?: ReaderReturnCoachState
  maxShows?: number
}): boolean {
  const state = opts?.state ?? readReaderReturnCoachState()
  if (state.learned) return false
  const maxShows = opts?.maxShows ?? READER_RETURN_COACH_MAX_SHOWS
  return state.shownCount < maxShows
}

export function recordReaderReturnCoachShown(state?: ReaderReturnCoachState): ReaderReturnCoachState {
  const cur = state ?? readReaderReturnCoachState()
  const next = { learned: cur.learned, shownCount: cur.shownCount + 1, version: 1 as const }
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
}

let lastDebug: ReaderReturnCoachDebugSnapshot = {
  mounted: false,
  eligible: false,
  learned: false,
  shownCount: 0,
  phase: 'idle',
  rightCoachVisible: false,
}

export function publishReaderReturnCoachDebug(next: Partial<ReaderReturnCoachDebugSnapshot>): void {
  lastDebug = { ...lastDebug, ...next }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nahaber-reader-return-coach-debug'))
  }
}

export function readReaderReturnCoachDebug(): ReaderReturnCoachDebugSnapshot {
  const s = readReaderReturnCoachState()
  return {
    ...lastDebug,
    learned: s.learned,
    shownCount: s.shownCount,
  }
}
