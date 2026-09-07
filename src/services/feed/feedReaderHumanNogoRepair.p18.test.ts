/**
 * P18 — Feed V2 HUMAN NO-GO repair: nested scroll, open authority, coaches V5/V2.
 * AUTOMATED — NOT HUMAN GO.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  markSwipeDiscoveryLearned,
  priorKeysWouldHaveSuppressedCoach,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_HINT_MS,
  SWIPE_DISCOVERY_REPEAT_COUNT,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_STORAGE_KEY_V4,
  SWIPE_DISCOVERY_TRAVEL_PX,
} from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  markReaderReturnCoachLearned,
  READER_RETURN_COACH_HINT_MS,
  READER_RETURN_COACH_REPEAT_COUNT,
  READER_RETURN_COACH_STORAGE_KEY,
  shouldShowReaderReturnCoach,
} from '@/lib/feed/reader/readerReturnCoach'
import { nestedFeedContentCanScroll } from '@/lib/feed/reader/nestedFeedScroll'
import { READER_GESTURE } from '@/lib/feed/reader/gestureArbitration'

const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  // @ts-expect-error test stub
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  }
})

describe('card first-paint — CTA/publisher outside nested copy scroll', () => {
  it('action zone is protected outside smart-feed-copy-scroll', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    const scrollIdx = card.indexOf('data-testid="smart-feed-copy-scroll"')
    const firstPaint = card.indexOf('data-feed-first-paint-actions="1"')
    const actionIdx = card.indexOf('data-testid="smart-feed-action-zone"')
    const pubIdx = card.indexOf('data-testid="smart-feed-publisher-row"')
    expect(scrollIdx).toBeGreaterThan(0)
    expect(firstPaint).toBeGreaterThan(scrollIdx)
    expect(actionIdx).toBeGreaterThan(0)
    expect(pubIdx).toBeGreaterThan(actionIdx)
    expect(card).toContain('data-feed-nested-scroll="1"')
    expect(card).toContain('--feed-v2-copy-scroll-max')
    expect(card).not.toMatch(/max-h-\[min\(42dvh/)
    const headlineIdx = card.indexOf('data-testid="smart-feed-headline"')
    expect(card.slice(headlineIdx - 200, headlineIdx)).not.toMatch(/line-clamp/)
  })

  it('nestedFeedContentCanScroll respects edges', () => {
    const el = {
      scrollHeight: 400,
      clientHeight: 200,
      scrollTop: 50,
      closest: () => el,
    }
    expect(nestedFeedContentCanScroll(el as unknown as EventTarget, 10)).toBe(true)
    expect(nestedFeedContentCanScroll(el as unknown as EventTarget, -10)).toBe(true)
    el.scrollTop = 0
    expect(nestedFeedContentCanScroll(el as unknown as EventTarget, -10)).toBe(false)
    el.scrollTop = 200
    expect(nestedFeedContentCanScroll(el as unknown as EventTarget, 10)).toBe(false)
  })
})

describe('open authority — no discovery /haber flicker', () => {
  it('SmartFeedClient always passes onDiscoveryArticleOpen through onRead', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('onDiscoveryArticleOpen={(d) => {')
    expect(client).not.toMatch(
      /onDiscoveryArticleOpen=\{\s*feedReaderEnabled && readerCapabilityReady/
    )
    // discovery path still uses onRead
    const idx = client.indexOf('onDiscoveryArticleOpen={(d) => {')
    const window = client.slice(idx, idx + 900)
    expect(window).toContain('onRead(')
    expect(window).not.toContain('router.push')
  })

  it('FeedDiscoveryRail only Links when onOpenArticle absent (guest-safe fallback)', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedDiscoveryRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('data-discovery-open="reader"')
    expect(rail).toContain('data-discovery-open="canonical"')
    expect(rail).toContain('if (onOpenArticle)')
  })
})

describe('RIGHT Haberi Aç V8 + LEFT return coach V4', () => {
  it('V8 key; prior V4 cannot suppress; travel + repeats', () => {
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v8')
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V4, JSON.stringify({ learned: true, shownCount: 40 }))
    expect(priorKeysWouldHaveSuppressedCoach()).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(36)
    expect(SWIPE_DISCOVERY_REPEAT_COUNT).toBeGreaterThanOrEqual(2)
    expect(SWIPE_DISCOVERY_HINT_MS).toBeGreaterThanOrEqual(3500)
    markSwipeDiscoveryLearned()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)

    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('data-swipe-discovery-v8')
    expect(coach).toContain('z-[40]')
    expect(coach).toContain('Haberi Aç')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('isCoachPaintedInViewport')
  })

  it('LEFT return coach V4; gesture-only learn; reactive coachClosing', () => {
    expect(READER_RETURN_COACH_STORAGE_KEY).toBe('nahaber.readerReturnCoach.v4')
    expect(shouldShowReaderReturnCoach()).toBe(true)
    expect(READER_RETURN_COACH_REPEAT_COUNT).toBeGreaterThanOrEqual(2)
    expect(READER_RETURN_COACH_HINT_MS).toBeGreaterThanOrEqual(3500)
    markReaderReturnCoachLearned()
    expect(shouldShowReaderReturnCoach()).toBe(false)

    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('coachClosing')
    expect(reader).toContain('setCoachClosing(true)')
    expect(reader).toContain("if (reason === 'gesture') markReaderReturnCoachLearned()")
    expect(reader).toContain('active={committed && !coachClosing}')
    expect(reader).not.toContain('active={committed && !closingRef.current}')

    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderReturnCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('Akışa Dön')
    expect(coach).toContain('data-reader-return-coach-v4')
    expect(coach).toContain('pointer-events-none')
  })

  it('gesture thresholds unchanged', () => {
    expect(READER_GESTURE.dominance).toBe(1.35)
    expect(READER_GESTURE.activatePx).toBe(14)
    expect(READER_GESTURE.completePx).toBe(72)
  })

  it('Reader ownership helpers preserved', () => {
    const history = readFileSync(join(process.cwd(), 'src/lib/feed/reader/history.ts'), 'utf8')
    expect(history).toContain('resolveFeedOwnerHistorySync')
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('foreignPopDuringCloseRef')
    expect(reader).toContain('armFeedOwnerRescue')
  })
})
