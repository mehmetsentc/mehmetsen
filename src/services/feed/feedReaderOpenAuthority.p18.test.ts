/**
 * P18 — Feed Reader OPEN authority + capability session latch.
 * LEFT swipe + Haberi Oku share decideFeedReadAction; transient errors must not /haber-escape.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideFeedReadAction,
  mapClickDebugFromDecision,
} from '@/lib/feed/reader/readerDebug'
import {
  createFeedReaderCapabilitySession,
  settleFeedReaderCapabilitySession,
  sessionReaderOpenEligible,
} from '@/lib/feed/reader/capabilitySession'

describe('A — open authority decisions', () => {
  it('1–2 ENABLED → OPEN_READER for both gesture and button inputs', () => {
    const decided = decideFeedReadAction({
      authLoading: false,
      capabilityReady: true,
      capabilityEnabled: true,
      capabilityError: false,
      sessionConfirmedEnabled: true,
    })
    expect(decided.decision).toBe('OPEN_READER')
    // Same pure function — LEFT and Haberi Oku must share this authority.
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: true,
        capabilityError: false,
        sessionConfirmedEnabled: true,
      })
    ).toEqual(decided)
  })

  it('3 SmartFeedClient routes LEFT + Haberi Oku through onRead → decideFeedReadAction', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("onReadClick={() => onRead(item, index, 'button')}")
    expect(client).toContain("onOpen: () => onRead(item, index, 'gesture')")
    expect(client).toContain('decideFeedReadAction')
    expect(client).toContain('sessionConfirmedEnabled')
    expect(client).toContain('capabilitySessionRef')
  })

  it('4 PENDING → no canonical decision', () => {
    expect(
      decideFeedReadAction({
        authLoading: true,
        capabilityReady: false,
        capabilityEnabled: false,
        capabilityError: false,
      }).decision
    ).toBe('PENDING')
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: false,
        capabilityEnabled: false,
        capabilityError: false,
      }).decision
    ).toBe('PENDING')
  })

  it('5 confirmed ENABLED + transient error → OPEN_READER (no /haber)', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: true,
        capabilityError: true,
        sessionConfirmedEnabled: true,
      })
    ).toEqual({ decision: 'OPEN_READER', fallbackReason: 'CAPABILITY_TRANSIENT' })
  })

  it('6 confirmed ENABLED + auth flicker → OPEN_READER', () => {
    expect(
      decideFeedReadAction({
        authLoading: true,
        capabilityReady: false,
        capabilityEnabled: false,
        capabilityError: false,
        sessionConfirmedEnabled: true,
      }).decision
    ).toBe('OPEN_READER')
  })

  it('7 authoritative DENIED → CANONICAL_FALLBACK (Reader does not open)', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: false,
        capabilityError: false,
        sessionConfirmedEnabled: false,
      })
    ).toEqual({ decision: 'CANONICAL_FALLBACK', fallbackReason: 'CAPABILITY_DISABLED' })
  })

  it('never-confirmed transport error → ERROR_RETAIN_FEED (not CANONICAL)', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: false,
        capabilityError: true,
        sessionConfirmedEnabled: false,
      })
    ).toEqual({ decision: 'ERROR_RETAIN_FEED', fallbackReason: 'CAPABILITY_ERROR' })
    expect(mapClickDebugFromDecision({ decision: 'ERROR_RETAIN_FEED' }).readDecision).toBe(
      'ERROR_RETAIN_FEED'
    )
  })

  it('8 SmartFeedClient retains Feed on ERROR_*; canonical push only after CANONICAL_FALLBACK', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("decided.decision === 'ERROR_RETAIN_FEED'")
    expect(client).toContain("Okuyucu şu an hazır değil, tekrar deneyin")
    const retainIdx = client.indexOf("decided.decision === 'ERROR_RETAIN_FEED'")
    const pushIdx = client.indexOf('router.push(ROUTES.NEWS_DETAIL(item.slug))')
    expect(retainIdx).toBeGreaterThan(0)
    expect(pushIdx).toBeGreaterThan(retainIdx)
    const between = client.slice(retainIdx, pushIdx)
    expect(between).toContain('return')
  })
})

describe('B — capability session latch', () => {
  it('transport error after ENABLED preserves confirmedEnabled', () => {
    let s = createFeedReaderCapabilitySession()
    s = settleFeedReaderCapabilitySession(s, {
      authLoading: false,
      authenticated: true,
      ready: true,
      enabled: true,
      transportError: false,
    })
    expect(sessionReaderOpenEligible(s)).toBe(true)
    s = settleFeedReaderCapabilitySession(s, {
      authLoading: false,
      authenticated: true,
      ready: false,
      enabled: false,
      transportError: true,
    })
    expect(s.confirmedEnabled).toBe(true)
    expect(s.transientError).toBe(true)
    expect(sessionReaderOpenEligible(s)).toBe(true)
  })

  it('authoritative denial clears confirmedEnabled', () => {
    let s = createFeedReaderCapabilitySession()
    s = settleFeedReaderCapabilitySession(s, {
      authLoading: false,
      authenticated: true,
      ready: true,
      enabled: true,
      transportError: false,
    })
    s = settleFeedReaderCapabilitySession(s, {
      authLoading: false,
      authenticated: true,
      ready: true,
      enabled: false,
      transportError: false,
    })
    expect(s.confirmedEnabled).toBe(false)
    expect(s.confirmedDenied).toBe(true)
    expect(sessionReaderOpenEligible(s)).toBe(false)
  })

  it('stale cancelled / never-ready does not invent ENABLED', () => {
    const s = settleFeedReaderCapabilitySession(createFeedReaderCapabilitySession(), {
      authLoading: false,
      authenticated: true,
      ready: false,
      enabled: false,
      transportError: false,
    })
    expect(sessionReaderOpenEligible(s)).toBe(false)
    expect(s.authority).toBe('pending')
  })
})

describe('C — coach capability gate', () => {
  it('coach only mounts when feedReaderEnabled && readerCapabilityReady', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toMatch(
      /showSwipeDiscoveryCoach=\{\s*Boolean\(\s*feedReaderEnabled\s*&&\s*readerCapabilityReady/
    )
    expect(client).toContain('settleFeedReaderCapabilitySession')
    expect(client).toContain('sessionReaderOpenEligible')
  })
})

describe('D — discovery rail remains separate /haber Link', () => {
  it('FeedDiscoveryRail still links to canonical article (intentional, not Haberi Oku path)', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedDiscoveryRail.tsx'),
      'utf8'
    )
    expect(rail).toMatch(/href=\{`\/haber\/\$\{item\.slug/)
  })
})

describe('E — close / media / coach repairs preserved', () => {
  it('Reader keeps pan-y Safari mitigation', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toMatch(/touch-action:\s*pan-y|touchAction:\s*['"]pan-y['"]/)
  })

  it('coach remains pointer-events-none', () => {
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('pointer-events-none')
  })
})
