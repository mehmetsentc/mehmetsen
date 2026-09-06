/**
 * P18 — second Production human NO-GO: runtime-truth diagnostic contracts.
 * Diagnostic display only — no Reader behavior / grant / SEO changes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EMPTY_FEED_READER_DEBUG,
  buildFeedReaderDebugBadgeLines,
  decideFeedReadAction,
  mapClickDebugFromDecision,
  shouldShowFeedReaderDebugPanel,
  FEED_READER_DEBUG_PILOT_UID,
  isFeedReaderDebugPilot,
} from '@/lib/feed/reader/readerDebug'

describe('A — unauth + readerDebug=1 → visible safe badge, capability false', () => {
  it('shows badge without pilotMatch and lists safe fields only', () => {
    expect(
      shouldShowFeedReaderDebugPanel({ readerDebugQuery: true, uid: null })
    ).toBe(true)
    const snap = {
      ...EMPTY_FEED_READER_DEBUG,
      authLoading: false,
      authenticated: false,
      uidMatch: false,
      capabilityReady: true,
      capabilityEnabled: false,
    }
    const lines = buildFeedReaderDebugBadgeLines(snap).join('\n')
    expect(lines).toContain('authenticated: false')
    expect(lines).toContain('pilotMatch: false')
    expect(lines).toContain('capabilityEnabled: false')
    expect(lines).not.toMatch(/wG8WTNlW38TILLvpDLsFmt8IMlg1/)
    expect(lines).not.toMatch(/Authorization|Bearer|token|email|cookie/i)
  })
})

describe('B — auth loading → badge shows pending', () => {
  it('maps PENDING click to WAIT_FOR_CAPABILITY', () => {
    const decided = decideFeedReadAction({
      authLoading: true,
      capabilityReady: false,
      capabilityEnabled: false,
      capabilityError: false,
    })
    expect(decided.decision).toBe('PENDING')
    expect(mapClickDebugFromDecision({ decision: decided.decision })).toEqual({
      capabilityAtClick: 'PENDING',
      readDecision: 'WAIT_FOR_CAPABILITY',
    })
  })
})

describe('C — authenticated pilot capability true mapping', () => {
  it('pilotMatch helper + OPEN_READER click labels', () => {
    expect(isFeedReaderDebugPilot(FEED_READER_DEBUG_PILOT_UID)).toBe(true)
    expect(
      mapClickDebugFromDecision({
        decision: decideFeedReadAction({
          authLoading: false,
          capabilityReady: true,
          capabilityEnabled: true,
          capabilityError: false,
        }).decision,
      })
    ).toEqual({ capabilityAtClick: 'ENABLED', readDecision: 'OPEN_READER' })
  })
})

describe('D — capability pending + click → WAIT, no premature canonical', () => {
  it('PENDING does not map to CANONICAL_FALLBACK', () => {
    const decided = decideFeedReadAction({
      authLoading: false,
      capabilityReady: false,
      capabilityEnabled: false,
      capabilityError: false,
    })
    expect(decided.decision).toBe('PENDING')
    expect(mapClickDebugFromDecision({ decision: 'PENDING' }).readDecision).toBe(
      'WAIT_FOR_CAPABILITY'
    )
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("if (decided.decision === 'PENDING') return")
  })
})

describe('E — capability true + click → OPEN_READER, no canonical push', () => {
  it('OPEN_READER path calls openReader before any NEWS_DETAIL push', () => {
    expect(mapClickDebugFromDecision({ decision: 'OPEN_READER' })).toEqual({
      capabilityAtClick: 'ENABLED',
      readDecision: 'OPEN_READER',
    })
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    const openIdx = client.indexOf("if (decided.decision === 'OPEN_READER')")
    const pushIdx = client.indexOf('router.push(ROUTES.NEWS_DETAIL(item.slug))')
    expect(openIdx).toBeGreaterThan(0)
    expect(pushIdx).toBeGreaterThan(openIdx)
    expect(client.slice(openIdx, openIdx + 400)).toContain('openReader(item, index)')
  })
})

describe('F — capability false + click → CANONICAL_FALLBACK', () => {
  it('settled disable maps to CANONICAL_FALLBACK and records routerPush flag', () => {
    expect(mapClickDebugFromDecision({ decision: 'CANONICAL_FALLBACK' })).toEqual({
      capabilityAtClick: 'DISABLED',
      readDecision: 'CANONICAL_FALLBACK',
    })
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('routerPushCanonicalCalled: true')
    expect(client).toContain("currentPath: 'CANONICAL_ARTICLE'")
  })
})

describe('G — openReader → readerItemSet → overlay mounted', () => {
  it('openReader patches mount truth fields', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    const idx = client.indexOf('const openReader = useCallback')
    const body = client.slice(idx, idx + 2200)
    expect(body).toContain('openReaderCalled: true')
    expect(body).toContain('readerItemSet: true')
    expect(body).toContain('readerOverlayMounted: true')
    expect(body).toContain('readerComponentRendered: true')
    expect(body).toContain('readerOpenGuardRef')
  })
})

describe('H — no diagnostic writes to social_events / analytics sinks', () => {
  it('readerDebug helpers never reference social_events or analytics posts', () => {
    const debug = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/readerDebug.ts'),
      'utf8'
    )
    expect(debug).not.toMatch(/social_events|postTelemetry|analytics/i)
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    // patchReaderDebug must remain local setState only
    expect(client).toContain('setReaderDebug((prev) => ({ ...prev, ...patch }))')
    expect(client).toContain('buildFeedReaderDebugBadgeLines')
    expect(client).toContain('READER DEBUG')
    expect(client).toContain('z-[200]')
  })
})

describe('readerDebug panel gate — query-only (P18 NO-GO2)', () => {
  it('shows for any uid when readerDebug=1; hides without query', () => {
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: true,
        uid: FEED_READER_DEBUG_PILOT_UID,
      })
    ).toBe(true)
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: true,
        uid: 'other-user',
      })
    ).toBe(true)
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: true,
        uid: null,
      })
    ).toBe(true)
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: false,
        uid: FEED_READER_DEBUG_PILOT_UID,
      })
    ).toBe(false)
  })

  it('EMPTY snapshot includes click-time + mount diagnostic fields', () => {
    expect(EMPTY_FEED_READER_DEBUG).toMatchObject({
      lastReadClick: false,
      capabilityAtClick: null,
      readDecision: null,
      openReaderCalled: false,
      routerPushCanonicalCalled: false,
      readerComponentRendered: false,
      readerUnmountReason: null,
      currentPath: 'FEED',
    })
  })
})
