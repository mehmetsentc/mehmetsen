/**
 * P18 — Feed V2 human UX completion: full copy, header switch, coaches.
 * AUTOMATED — NOT HUMAN GO.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_V2_LAYOUT_TEST_VIEWPORTS,
  feedV2ActionsFitViewport,
  feedV2BottomClearancePx,
  feedV2ContentBudgetPx,
} from '@/lib/feed/reader/feedChrome'
import {
  markSwipeDiscoveryLearned,
  priorKeysWouldHaveSuppressedCoach,
  readSwipeDiscoveryState,
  recordSwipeDiscoveryShown,
  resetSwipeDiscoveryPresentation,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_ANIM_MS,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_STORAGE_KEY_V1,
  SWIPE_DISCOVERY_STORAGE_KEY_V2,
  SWIPE_DISCOVERY_STORAGE_KEY_V3,
  SWIPE_DISCOVERY_TRAVEL_PX,
  writeSwipeDiscoveryState,
} from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  markReaderReturnCoachLearned,
  READER_RETURN_COACH_ANIM_MS,
  READER_RETURN_COACH_SETTLE_MS,
  READER_RETURN_COACH_STORAGE_KEY,
  READER_RETURN_COACH_TRAVEL_PX,
  readReaderReturnCoachState,
  resetReaderReturnCoachPresentation,
  shouldShowReaderReturnCoach,
} from '@/lib/feed/reader/readerReturnCoach'
import { selectSmartFeedSummary } from '@/lib/feed/smartFeedSummary'

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

describe('P18 full headline + summary', () => {
  it('FullscreenNewsCard has no CSS line-clamp / artificial ellipsis on headline or summary', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    const headlineIdx = card.indexOf('data-testid="smart-feed-headline"')
    const summaryIdx = card.indexOf('data-testid="smart-feed-summary"')
    expect(headlineIdx).toBeGreaterThan(0)
    expect(summaryIdx).toBeGreaterThan(0)
    const headlineBlock = card.slice(headlineIdx - 280, headlineIdx + 120)
    const summaryBlock = card.slice(summaryIdx - 280, summaryIdx + 120)
    expect(headlineBlock).not.toMatch(/line-clamp/)
    expect(summaryBlock).not.toMatch(/line-clamp/)
    expect(headlineBlock).not.toMatch(/truncate/)
    expect(summaryBlock).not.toMatch(/text-ellipsis/)
    expect(card).not.toMatch(/item\.title\.slice\(/)
    expect(card).not.toMatch(/item\.summary\.slice\(/)
  })

  it('prefers fuller canonical spot over truncated summary when appropriate', () => {
    const picked = selectSmartFeedSummary({
      summary: 'Kısa kesik metin...',
      spot: 'Bu daha uzun ve tamamlanmış bir spot metnidir. Okuyucu tam metni görebilir.',
    })
    expect(picked).toContain('daha uzun')
    expect(picked).not.toMatch(/\.\.\.\s*$/)
  })

  it('CTA followed by publisher/source row in card markup', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    const cta = card.indexOf('smart-feed-read-cta')
    const pub = card.indexOf('smart-feed-publisher-row')
    expect(cta).toBeGreaterThan(0)
    expect(pub).toBeGreaterThan(cta)
    expect(card).toContain('smart-feed-action-zone')
  })
})

describe('P18 header + sidebar', () => {
  it('header has icon-only Home + Zap with active states; no Feed 2 text', () => {
    const navbar = readFileSync(
      join(process.cwd(), 'src/components/layout/Navbar.tsx'),
      'utf8'
    )
    expect(navbar).toContain('header-nav-ana-feed')
    expect(navbar).toContain('header-nav-feed-v2')
    expect(navbar).toContain('<Home ')
    expect(navbar).toContain('<Zap ')
    expect(navbar).toContain('aria-label="Ana Feed"')
    expect(navbar).toContain('ROUTES.FEED_V2')
    expect(navbar).not.toMatch(/>\s*Feed 2\s*</)
    expect(navbar).not.toMatch(/>\s*Feed V2\s*</)
  })

  it('sidebar uses Akıllı Akış; no user-facing Feed 2 label', () => {
    const sidebar = readFileSync(
      join(process.cwd(), 'src/components/layout/Sidebar.tsx'),
      'utf8'
    )
    expect(sidebar).toContain('Akıllı Akış')
    expect(sidebar).not.toMatch(/>\s*Feed 2\s*</)
    expect(sidebar).toContain('<Zap ')
    expect(sidebar).toContain('ROUTES.FEED_V2')
  })

  it('MobileNav remains gated off under Global Nav V2', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src/components/layout/MainLayoutClient.tsx'),
      'utf8'
    )
    expect(layout).toContain('resolveMobileNavVisible')
    expect(layout).toContain('showMobileNav')
  })
})

describe('P18 RIGHT open + LEFT return coaches', () => {
  it('RIGHT Haberi Aç V7: prior keys cannot suppress; eligible until learned', () => {
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v7')
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V1, JSON.stringify({ learned: true, shownCount: 3 }))
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V2, JSON.stringify({ learned: true, shownCount: 3 }))
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V3, JSON.stringify({ learned: true, shownCount: 3 }))
    expect(priorKeysWouldHaveSuppressedCoach()).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    for (let i = 0; i < 5; i++) recordSwipeDiscoveryShown()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    markSwipeDiscoveryLearned()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)
  })

  it('RIGHT Haberi Aç travel/duration; Haberi Oku does not mark learned', () => {
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(36)
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeLessThanOrEqual(48)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeGreaterThanOrEqual(800)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeLessThanOrEqual(1100)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeGreaterThanOrEqual(1200)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeLessThanOrEqual(1800)
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('Haberi Aç')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('data-swipe-discovery-v7')
    expect(coach).toContain('isCoachPaintedInViewport')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
    expect(client).not.toMatch(/openSource === 'button'\) markSwipeDiscoveryLearned/)
  })

  it('LEFT return coach: mounts in Reader; learn only on gesture close', () => {
    expect(READER_RETURN_COACH_STORAGE_KEY).toBe('nahaber.readerReturnCoach.v4')
    expect(shouldShowReaderReturnCoach()).toBe(true)
    expect(READER_RETURN_COACH_TRAVEL_PX).toBeGreaterThanOrEqual(36)
    expect(READER_RETURN_COACH_TRAVEL_PX).toBeLessThanOrEqual(48)
    expect(READER_RETURN_COACH_ANIM_MS).toBeGreaterThanOrEqual(800)
    expect(READER_RETURN_COACH_SETTLE_MS).toBeGreaterThanOrEqual(1500)
    markReaderReturnCoachLearned()
    expect(readReaderReturnCoachState().learned).toBe(true)
    expect(shouldShowReaderReturnCoach()).toBe(false)
    resetReaderReturnCoachPresentation()
    expect(shouldShowReaderReturnCoach()).toBe(true)

    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('ReaderReturnCoach')
    expect(reader).toContain('markReaderReturnCoachLearned')
    expect(reader).toContain("if (reason === 'gesture') markReaderReturnCoachLearned()")
    expect(reader).toContain("onClick={() => beginClose('button')}")
    // Back-arrow path must not call markReaderReturnCoachLearned on the same line.
    expect(reader).not.toContain("beginClose('button'); markReaderReturnCoachLearned")
    expect(reader).not.toContain("markReaderReturnCoachLearned(); beginClose('button')")

    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderReturnCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('Akışa Dön')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('-READER_RETURN_COACH_TRAVEL_PX')
  })

  it('Reader ownership helpers remain intact', () => {
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

describe('P18 viewport budget still fits CTA zone', () => {
  it('action zone budget remains positive across target heights', () => {
    for (const vp of FEED_V2_LAYOUT_TEST_VIEWPORTS) {
      // Full copy may use internal scroll; reserved action zone + clearance must still fit.
      expect(
        feedV2ActionsFitViewport({
          viewportHeight: vp.h,
          safeTop: 47,
          safeBottom: 34,
          copyPreviewPx: 160,
        })
      ).toBe(true)
      expect(feedV2BottomClearancePx({ safeBottom: 34 })).toBeLessThan(80)
      expect(feedV2ContentBudgetPx({ viewportHeight: vp.h, safeTop: 47, safeBottom: 34 })).toBeGreaterThan(
        400
      )
    }
  })
})
