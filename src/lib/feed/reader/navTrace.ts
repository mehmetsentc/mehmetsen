/**
 * Temporary pilot-only Reader navigation diagnostic.
 * Enabled only with ?readerDebug=1. In-memory, current browser session.
 * No user identifiers, no secrets, no analytics/social writes.
 */

export type ReaderNavTraceEventType =
  | 'feed_mount'
  | 'feed_unmount'
  | 'reader_open'
  | 'reader_close'
  | 'reader_cleanup'
  | 'pushState'
  | 'replaceState'
  | 'history_back_request'
  | 'popstate'
  | 'close_blocked'
  | 'gesture_accepted'
  | 'reader_state_open'
  | 'reader_first_frame'
  | 'body_available'
  | 'hero_resolved'

export type ReaderNavTraceEvent = {
  seq: number
  t: number
  type: ReaderNavTraceEventType
  pathname: string
  search: string
  historyLength: number
  readerOpenId: string | null
  feedSessionId: string | null
  readerMounted: boolean
  feedMounted: boolean
  readerState: 'open' | 'closed' | 'closing'
  openSource?: 'swipe' | 'haberi_oku' | 'unknown'
  closeSource?: 'swipe' | 'browser_back' | 'ui' | 'popstate' | 'escape'
  articleId?: string | null
  feedIndex?: number | null
  mode?: string | null
  category?: string | null
  ownsReaderEntry?: boolean
  readerOpenIdInState?: string | null
}

const MAX_EVENTS = 200

let enabled = false
let seq = 0
const events: ReaderNavTraceEvent[] = []

export type ReaderOpenTiming = {
  readerOpenId: string
  gestureAcceptedAt: number | null
  stateOpenAt: number | null
  firstFrameAt: number | null
  bodyAvailableAt: number | null
  heroResolvedAt: number | null
}

const timings = new Map<string, ReaderOpenTiming>()

export function setReaderNavTraceEnabled(next: boolean): void {
  enabled = Boolean(next)
}

export function isReaderNavTraceEnabled(): boolean {
  return enabled
}

export function resetReaderNavTrace(): void {
  seq = 0
  events.length = 0
  timings.clear()
}

export function recordReaderNavTrace(
  partial: Omit<ReaderNavTraceEvent, 'seq' | 't'> & { t?: number }
): ReaderNavTraceEvent | null {
  if (!enabled) return null
  seq += 1
  const ev: ReaderNavTraceEvent = {
    ...partial,
    seq,
    t: partial.t ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  }
  events.push(ev)
  if (events.length > MAX_EVENTS) events.shift()
  return ev
}

export function getReaderNavTrace(): ReaderNavTraceEvent[] {
  return events.slice()
}

export function markReaderOpenTiming(
  readerOpenId: string,
  field: keyof Omit<ReaderOpenTiming, 'readerOpenId'>,
  at?: number
): void {
  if (!enabled || !readerOpenId) return
  const now = at ?? (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const cur = timings.get(readerOpenId) ?? {
    readerOpenId,
    gestureAcceptedAt: null,
    stateOpenAt: null,
    firstFrameAt: null,
    bodyAvailableAt: null,
    heroResolvedAt: null,
  }
  cur[field] = now
  timings.set(readerOpenId, cur)
}

export function getReaderOpenTimings(): ReaderOpenTiming[] {
  return [...timings.values()]
}

export function summarizeReaderOpenTimings(): {
  count: number
  medianOpenMs: number | null
  slowestOpenMs: number | null
  medianBodyMs: number | null
  slowestBodyMs: number | null
  medianHeroMs: number | null
  slowestHeroMs: number | null
} {
  const rows = getReaderOpenTimings()
    .map((r) => {
      const start = r.gestureAcceptedAt ?? r.stateOpenAt
      if (start == null) return null
      return {
        open: (r.firstFrameAt ?? r.stateOpenAt ?? start) - start,
        body: r.bodyAvailableAt != null ? r.bodyAvailableAt - start : null,
        hero: r.heroResolvedAt != null ? r.heroResolvedAt - start : null,
      }
    })
    .filter((r): r is { open: number; body: number | null; hero: number | null } => r !== null)

  const median = (nums: number[]) => {
    if (!nums.length) return null
    const s = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
  }

  const opens = rows.map((r) => r.open)
  const bodies = rows.map((r) => r.body).filter((n): n is number => n != null)
  const heros = rows.map((r) => r.hero).filter((n): n is number => n != null)
  return {
    count: rows.length,
    medianOpenMs: median(opens),
    slowestOpenMs: opens.length ? Math.max(...opens) : null,
    medianBodyMs: median(bodies),
    slowestBodyMs: bodies.length ? Math.max(...bodies) : null,
    medianHeroMs: median(heros),
    slowestHeroMs: heros.length ? Math.max(...heros) : null,
  }
}
