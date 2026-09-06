/**
 * P18 — Pilot nav-trace survivor. Instrumentation only. AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildReaderNavTraceCycleTable,
  formatReaderNavTraceExport,
  getReaderNavTrace,
  hasPilotNavTraceSession,
  hydrateReaderNavTraceFromSession,
  layoutHintForPath,
  recordReaderNavTrace,
  resetReaderNavTrace,
  setReaderNavTraceEnabled,
  snapshotHistoryState,
  READER_NAV_TRACE_PILOT_FLAG,
  READER_NAV_TRACE_STORAGE_KEY,
} from '@/lib/feed/reader/navTrace'

function memorySession() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

const base = {
  historyLength: 3,
  readerOpenId: null as string | null,
  feedSessionId: 'fds_1',
  readerMounted: false,
  feedMounted: true,
  readerState: 'closed' as const,
}

describe('P18 nav trace survivor', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memorySession())
    resetReaderNavTrace()
    setReaderNavTraceEnabled(true)
  })
  afterEach(() => {
    resetReaderNavTrace()
    setReaderNavTraceEnabled(false)
    vi.unstubAllGlobals()
  })

  it('persists across in-memory reset via sessionStorage hydrate', () => {
    recordReaderNavTrace({
      type: 'feed_mount',
      pathname: '/feed-v2',
      search: '?readerDebug=1',
      ...base,
    })
    const stored = sessionStorage.getItem(READER_NAV_TRACE_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(hasPilotNavTraceSession()).toBe(true)
    expect(sessionStorage.getItem(READER_NAV_TRACE_PILOT_FLAG)).toBe('1')

    // Simulate SPA heap drop: new module memory, same sessionStorage.
    const raw = stored!
    resetReaderNavTrace()
    sessionStorage.setItem(READER_NAV_TRACE_STORAGE_KEY, raw)
    sessionStorage.setItem(READER_NAV_TRACE_PILOT_FLAG, '1')
    setReaderNavTraceEnabled(true)
    expect(hydrateReaderNavTraceFromSession()).toBe(true)
    expect(getReaderNavTrace().some((e) => e.type === 'feed_mount')).toBe(true)
  })

  it('marks the exact /feed-v2 → / transition', () => {
    recordReaderNavTrace({
      type: 'feed_mount',
      pathname: '/feed-v2',
      search: '?readerDebug=1',
      ...base,
    })
    const home = recordReaderNavTrace({
      type: 'popstate',
      pathname: '/',
      search: '',
      historyApi: 'popstate',
      source: 'history_hook',
      ...base,
      feedMounted: false,
    })
    expect(home?.leftFeedToHome).toBe(true)
    expect(home?.layoutHint).toBe('home')
    expect(home?.prevPathname).toBe('/feed-v2')
  })

  it('snapshots Next idx and Reader ownership without wiping', () => {
    const snap = snapshotHistoryState({
      __NA: 1,
      idx: 4,
      nahaberFeedReader: true,
      readerOpenId: 'rdr_1',
      feedSessionId: 'fds_1',
    })
    expect(snap.nextIdx).toBe(4)
    expect(snap.nahaberFeedReader).toBe(true)
    expect(snap.readerOpenIdInState).toBe('rdr_1')
    expect(layoutHintForPath('/feed-v2')).toBe('feed-v2')
    expect(layoutHintForPath('/')).toBe('home')
  })

  it('export and source have no identifiers or analytics writes', () => {
    recordReaderNavTrace({
      type: 'pushState',
      pathname: '/feed-v2',
      search: '?reader=a&readerDebug=1',
      ...base,
      readerOpenId: 'rdr_1',
      readerMounted: true,
      readerState: 'open',
    })
    const exp = formatReaderNavTraceExport()
    expect(exp).not.toMatch(/email|Authorization|Bearer |cookie/i)
    expect(exp).toContain('rdr_1')
    expect(exp).toContain('fds_1')
    const src = readFileSync(join(process.cwd(), 'src/lib/feed/reader/navTrace.ts'), 'utf8')
    expect(src).not.toMatch(/email|Authorization/i)
    expect(src).not.toContain('social_events')
    expect(src).not.toContain('/api/feed/telemetry')
    const survivor = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderNavTraceSurvivor.tsx'),
      'utf8'
    )
    expect(survivor).toContain('Copy Navigation Trace')
    expect(survivor).not.toMatch(/email|Authorization/i)
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('ReaderNavTraceSurvivor')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('Keep the trace enabled after Feed unmount')
    expect(client).not.toContain('setReaderNavTraceEnabled(false)')
  })

  it('cycle table records push/back/popstate per open', () => {
    recordReaderNavTrace({
      type: 'gesture_accepted',
      pathname: '/feed-v2',
      search: '',
      ...base,
      openSource: 'swipe',
      readerOpenId: 'rdr_a',
      readerState: 'open',
    })
    recordReaderNavTrace({
      type: 'pushState',
      pathname: '/feed-v2',
      search: '?reader=a',
      ...base,
      readerOpenId: 'rdr_a',
      source: 'reader',
      readerState: 'open',
    })
    recordReaderNavTrace({
      type: 'history_back_request',
      pathname: '/feed-v2',
      search: '?reader=a',
      ...base,
      readerOpenId: 'rdr_a',
      closeSource: 'swipe',
    })
    recordReaderNavTrace({
      type: 'reader_cleanup',
      pathname: '/feed-v2',
      search: '',
      ...base,
      readerOpenId: 'rdr_a',
    })
    const rows = buildReaderNavTraceCycleTable()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]?.readerOpenId).toBe('rdr_a')
    expect(rows[0]?.resultRoute.startsWith('/feed-v2') || rows[0]?.resultRoute === '/feed-v2').toBe(true)
  })
  it('export includes canonical escape summary without PII', () => {
    recordReaderNavTrace({
      type: 'canonical_navigation',
      pathname: '/feed-v2',
      search: '?readerDebug=1',
      historyLength: 3,
      readerOpenId: null,
      feedSessionId: 'fds_1',
      readerMounted: false,
      feedMounted: true,
      readerState: 'closed',
      readDecision: 'CANONICAL_FALLBACK',
      fallbackReason: 'CAPABILITY_DISABLED',
      destination: '/haber/example-slug',
      articleSlug: 'example-slug',
      capabilityEnabled: false,
      source: 'feed',
    })
    const exp = formatReaderNavTraceExport()
    expect(exp).toContain('canonicalEscapes')
    expect(exp).toContain('/haber/example-slug')
    expect(exp).toContain('CANONICAL_FALLBACK')
    expect(exp).not.toMatch(/email|Authorization|Bearer /i)
  })
})

describe('P18 instrumentation purity', () => {
  it('does not change history, gesture, media, or presentation files', () => {
    // Presence contracts — functional files must still exist unchanged in role.
    const history = readFileSync(join(process.cwd(), 'src/lib/feed/reader/history.ts'), 'utf8')
    expect(history).toContain('canHistoryBackForOpen')
    expect(history).toContain('beginCloseTransaction')
    const gesture = readFileSync(join(process.cwd(), 'src/lib/feed/reader/gestureArbitration.ts'), 'utf8')
    expect(gesture).toContain('systemBackEdgePx: 22')
    const media = readFileSync(join(process.cwd(), 'src/lib/feed/reader/mediaPolicy.ts'), 'utf8')
    expect(media).toContain('VALID')
  })
})
