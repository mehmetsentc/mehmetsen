/**
 * Temporary pilot-only Reader navigation diagnostic.
 * Enabled with ?readerDebug=1. Survives /feed-v2 → / via sessionStorage.
 * No user identifiers, no secrets, no analytics/social writes.
 */

import { READER_GESTURE } from '@/lib/feed/reader/gestureArbitration'

export const READER_NAV_TRACE_STORAGE_KEY = 'nahaber.readerNavTrace.v1'
export const READER_NAV_TRACE_PILOT_FLAG = 'nahaber.readerNavTrace.pilot'

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
  | 'pageshow'
  | 'route_change'
  | 'close_blocked'
  | 'gesture_accepted'
  | 'gesture_ignored_ios_edge'
  | 'reader_state_open'
  | 'reader_first_frame'
  | 'body_available'
  | 'hero_resolved'
  | 'read_decision'
  | 'canonical_navigation'
  | 'open_guard_blocked'

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
  nextIdx?: number | null
  nahaberFeedReader?: boolean | null
  feedSessionIdInState?: string | null
  closePhase?: string | null
  historyApi?: 'pushState' | 'replaceState' | 'back' | 'popstate' | 'pageshow'
  prevPathname?: string | null
  leftFeedToHome?: boolean
  startClientX?: number | null
  viewportWidth?: number | null
  nearSystemBackEdge?: boolean | null
  source?: 'history_hook' | 'reader' | 'feed' | 'route'
  layoutHint?: 'feed-v2' | 'home' | 'other'
  /** decideFeedReadAction result — no PII */
  readDecision?: string | null
  fallbackReason?: string | null
  capabilityEnabled?: boolean | null
  capabilityReady?: boolean | null
  capabilityError?: boolean | null
  /** Guard articleId when open was blocked (id only, not title/body) */
  guardArticleId?: string | null
  /** Navigation target path when known (e.g. /haber/slug) */
  destination?: string | null
  articleSlug?: string | null
}

const MAX_EVENTS = 240

let enabled = false
let seq = 0
const events: ReaderNavTraceEvent[] = []
let hooksInstalled = false
let lastPathname = ''
let pendingGestureAcceptedAt: number | null = null

export type ReaderOpenTiming = {
  readerOpenId: string
  gestureAcceptedAt: number | null
  stateOpenAt: number | null
  firstFrameAt: number | null
  bodyAvailableAt: number | null
  heroResolvedAt: number | null
}

const timings = new Map<string, ReaderOpenTiming>()

type HistoryStateSnap = {
  nextIdx: number | null
  nahaberFeedReader: boolean | null
  readerOpenIdInState: string | null
  feedSessionIdInState: string | null
}

function asRecord(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  return state as Record<string, unknown>
}

export function snapshotHistoryState(state: unknown): HistoryStateSnap {
  const s = asRecord(state)
  if (!s) {
    return {
      nextIdx: null,
      nahaberFeedReader: null,
      readerOpenIdInState: null,
      feedSessionIdInState: null,
    }
  }
  return {
    nextIdx: typeof s.idx === 'number' && Number.isFinite(s.idx) ? s.idx : null,
    nahaberFeedReader: s.nahaberFeedReader === true ? true : s.nahaberFeedReader === false ? false : null,
    readerOpenIdInState: typeof s.readerOpenId === 'string' && s.readerOpenId ? s.readerOpenId : null,
    feedSessionIdInState: typeof s.feedSessionId === 'string' && s.feedSessionId ? s.feedSessionId : null,
  }
}

export function layoutHintForPath(pathname: string): 'feed-v2' | 'home' | 'other' {
  if (pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')) return 'feed-v2'
  if (pathname === '/' || pathname === '') return 'home'
  return 'other'
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

function persist(): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(
      READER_NAV_TRACE_STORAGE_KEY,
      JSON.stringify({
        seq,
        events,
        timings: [...timings.values()],
      })
    )
    if (enabled) ss.setItem(READER_NAV_TRACE_PILOT_FLAG, '1')
  } catch {
    // Quota / private mode — drop persistence, keep memory.
  }
}

export function hydrateReaderNavTraceFromSession(): boolean {
  const ss = storage()
  if (!ss) return false
  try {
    const raw = ss.getItem(READER_NAV_TRACE_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as {
      seq?: number
      events?: ReaderNavTraceEvent[]
      timings?: ReaderOpenTiming[]
    }
    if (!Array.isArray(parsed.events)) return false
    events.length = 0
    events.push(...parsed.events.slice(-MAX_EVENTS))
    seq = typeof parsed.seq === 'number' ? parsed.seq : events.length
    timings.clear()
    for (const row of parsed.timings ?? []) {
      if (row && typeof row.readerOpenId === 'string') timings.set(row.readerOpenId, row)
    }
    return true
  } catch {
    return false
  }
}

export function hasPilotNavTraceSession(): boolean {
  const ss = storage()
  if (!ss) return false
  try {
    return ss.getItem(READER_NAV_TRACE_PILOT_FLAG) === '1'
  } catch {
    return false
  }
}

export function setReaderNavTraceEnabled(next: boolean): void {
  enabled = Boolean(next)
  if (enabled) {
    const ss = storage()
    try {
      ss?.setItem(READER_NAV_TRACE_PILOT_FLAG, '1')
    } catch {
      // ignore
    }
    if (events.length === 0) hydrateReaderNavTraceFromSession()
    installReaderNavTraceHooks()
  }
}

export function isReaderNavTraceEnabled(): boolean {
  return enabled
}

export function resetReaderNavTrace(): void {
  seq = 0
  events.length = 0
  timings.clear()
  pendingGestureAcceptedAt = null
  lastPathname = ''
  const ss = storage()
  try {
    ss?.removeItem(READER_NAV_TRACE_STORAGE_KEY)
    ss?.removeItem(READER_NAV_TRACE_PILOT_FLAG)
  } catch {
    // ignore
  }
}

function enrich(
  partial: Omit<ReaderNavTraceEvent, 'seq' | 't'> & { t?: number }
): Omit<ReaderNavTraceEvent, 'seq' | 't'> & { t?: number } {
  const loc =
    typeof window !== 'undefined'
      ? { pathname: window.location.pathname, search: window.location.search }
      : { pathname: partial.pathname, search: partial.search }
  const histState = typeof window !== 'undefined' ? window.history.state : null
  const snap = snapshotHistoryState(histState)
  const pathname = partial.pathname || loc.pathname
  const prev = partial.prevPathname ?? (lastPathname || null)
  const leftFeedToHome = Boolean(
    (prev === '/feed-v2' || (prev && prev.startsWith('/feed-v2'))) &&
      (pathname === '/' || pathname === '')
  )
  return {
    ...partial,
    pathname,
    search: partial.search || loc.search,
    historyLength:
      partial.historyLength ||
      (typeof window !== 'undefined' ? window.history.length : partial.historyLength),
    nextIdx: partial.nextIdx ?? snap.nextIdx,
    nahaberFeedReader: partial.nahaberFeedReader ?? snap.nahaberFeedReader,
    readerOpenIdInState: partial.readerOpenIdInState ?? snap.readerOpenIdInState,
    feedSessionIdInState: partial.feedSessionIdInState ?? snap.feedSessionIdInState,
    prevPathname: prev,
    leftFeedToHome: partial.leftFeedToHome ?? leftFeedToHome,
    layoutHint: partial.layoutHint ?? layoutHintForPath(pathname),
  }
}

export function recordReaderNavTrace(
  partial: Omit<ReaderNavTraceEvent, 'seq' | 't'> & { t?: number }
): ReaderNavTraceEvent | null {
  if (!enabled) return null
  seq += 1
  const filled = enrich(partial)
  const ev: ReaderNavTraceEvent = {
    ...filled,
    seq,
    t: filled.t ?? nowMs(),
  }
  events.push(ev)
  if (events.length > MAX_EVENTS) events.shift()
  lastPathname = ev.pathname
  if (ev.type === 'gesture_accepted') pendingGestureAcceptedAt = ev.t
  persist()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nahaber-reader-nav-trace'))
  }
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
  const stamp = at ?? nowMs()
  const cur = timings.get(readerOpenId) ?? {
    readerOpenId,
    gestureAcceptedAt: null,
    stateOpenAt: null,
    firstFrameAt: null,
    bodyAvailableAt: null,
    heroResolvedAt: null,
  }
  cur[field] = stamp
  if (field === 'stateOpenAt' && cur.gestureAcceptedAt == null && pendingGestureAcceptedAt != null) {
    cur.gestureAcceptedAt = pendingGestureAcceptedAt
    pendingGestureAcceptedAt = null
  }
  timings.set(readerOpenId, cur)
  persist()
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

export function nearSystemBackEdge(startClientX: number, viewportWidth: number): boolean {
  return startClientX <= READER_GESTURE.systemBackEdgePx && viewportWidth > 0
}

function recordHook(opts: {
  type: ReaderNavTraceEventType
  historyApi: NonNullable<ReaderNavTraceEvent['historyApi']>
}): void {
  if (!enabled || typeof window === 'undefined') return
  recordReaderNavTrace({
    type: opts.type,
    pathname: window.location.pathname,
    search: window.location.search,
    historyLength: window.history.length,
    readerOpenId: null,
    feedSessionId: null,
    readerMounted: window.location.pathname.startsWith('/feed-v2') && Boolean(document.querySelector('[data-reader-open="1"]')),
    feedMounted: Boolean(document.querySelector('[data-feed-mounted="1"]')),
    readerState: 'closed',
    historyApi: opts.historyApi,
    source: 'history_hook',
  })
}

export function installReaderNavTraceHooks(): void {
  if (hooksInstalled || typeof window === 'undefined' || typeof history === 'undefined') return
  hooksInstalled = true
  lastPathname = window.location.pathname

  const proto = History.prototype
  const origPush = proto.pushState
  const origReplace = proto.replaceState
  const origBack = proto.back

  proto.pushState = function patchedPush(this: History, data: unknown, unused: string, url?: string | URL | null) {
    origPush.call(this, data, unused, url)
    recordHook({ type: 'pushState', historyApi: 'pushState' })
  }
  proto.replaceState = function patchedReplace(this: History, data: unknown, unused: string, url?: string | URL | null) {
    origReplace.call(this, data, unused, url)
    recordHook({ type: 'replaceState', historyApi: 'replaceState' })
  }
  proto.back = function patchedBack(this: History) {
    recordHook({ type: 'history_back_request', historyApi: 'back' })
    origBack.call(this)
  }

  window.addEventListener('popstate', () => {
    recordHook({ type: 'popstate', historyApi: 'popstate' })
  })
  window.addEventListener('pageshow', () => {
    recordHook({ type: 'pageshow', historyApi: 'pageshow' })
  })
}

export type ReaderNavTraceCycleRow = {
  cycle: number
  openSource: string
  readerOpenId: string | null
  pushCount: number
  closeSource: string
  backCount: number
  popstateCount: number
  resultRoute: string
}

export function buildReaderNavTraceCycleTable(list = events): ReaderNavTraceCycleRow[] {
  const rows: ReaderNavTraceCycleRow[] = []
  let cycle = 0
  let open: ReaderNavTraceEvent | null = null
  let pushCount = 0
  let backCount = 0
  let popstateCount = 0
  for (const ev of list) {
    if (ev.type === 'pushState') pushCount += 1
    if (ev.type === 'history_back_request') backCount += 1
    if (ev.type === 'popstate') popstateCount += 1
    if (ev.type === 'gesture_accepted' || ev.type === 'reader_open' || (ev.type === 'pushState' && ev.source === 'reader')) {
      if (!open && (ev.type === 'gesture_accepted' || ev.readerState === 'open')) {
        open = ev
        cycle += 1
        pushCount = ev.type === 'pushState' ? 1 : 0
        backCount = 0
        popstateCount = 0
      }
    }
    if (open && (ev.type === 'reader_cleanup' || ev.type === 'reader_close' || ev.leftFeedToHome)) {
      rows.push({
        cycle,
        openSource: open.openSource ?? 'unknown',
        readerOpenId: open.readerOpenId ?? ev.readerOpenId,
        pushCount,
        closeSource: ev.closeSource ?? (ev.leftFeedToHome ? 'left_feed_to_home' : ev.type),
        backCount,
        popstateCount,
        resultRoute: ev.pathname,
      })
      open = null
    }
  }
  return rows
}

export function formatReaderNavTraceExport(): string {
  const payload = {
    v: 1,
    note: 'pilot nav trace — no user identifiers',
    events,
    timings: getReaderOpenTimings(),
    summary: summarizeReaderOpenTimings(),
    cycles: buildReaderNavTraceCycleTable(),
    leftFeedToHome: events.filter((e) => e.leftFeedToHome).map((e) => ({
      seq: e.seq,
      type: e.type,
      historyApi: e.historyApi,
      prevPathname: e.prevPathname,
      pathname: e.pathname,
      nextIdx: e.nextIdx,
      historyLength: e.historyLength,
    })),
    canonicalEscapes: events
      .filter((e) => e.type === 'canonical_navigation' || e.destination?.startsWith('/haber/'))
      .map((e) => ({
        seq: e.seq,
        type: e.type,
        readDecision: e.readDecision ?? null,
        fallbackReason: e.fallbackReason ?? null,
        destination: e.destination ?? null,
        articleSlug: e.articleSlug ?? null,
        capabilityEnabled: e.capabilityEnabled ?? null,
        capabilityError: e.capabilityError ?? null,
      })),
  }
  return JSON.stringify(payload)
}
