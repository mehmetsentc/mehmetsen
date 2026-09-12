/**
 * P18 — Feed V2 mobile card fit + swipe coach V3 visibility.
 * AUTOMATED — NOT HUMAN GO. Does not touch Reader ownership.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_V2_LAYOUT_TEST_VIEWPORTS,
  feedV2ActionsFitViewport,
  feedV2BottomClearancePx,
  feedV2ContentBudgetPx,
  feedV2FirstPaintFits,
  feedV2HeroMinPx,
  feedV2TypicalCopyPx,
} from '@/lib/feed/reader/feedChrome'
import {
  isCoachPaintedInViewport,
  hasFeedCoachShownForArticle,
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
  SWIPE_DISCOVERY_TRAVEL_PX,
  writeSwipeDiscoveryState,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  resetSwipeDiscoveryPresentation()
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

describe('P18 Feed V2 card fit matrix', () => {
  it('first-paint budget fits all target viewports with full typical copy', () => {
    for (const vp of FEED_V2_LAYOUT_TEST_VIEWPORTS) {
      expect(
        feedV2FirstPaintFits({
          viewportHeight: vp.h,
          safeTop: 47,
          safeBottom: 34,
          topChromePx: 56,
          copyPx: feedV2TypicalCopyPx(vp.h),
          heroMinPx: feedV2HeroMinPx(vp.h),
        })
      ).toBe(true)
      expect(
        feedV2ActionsFitViewport({
          viewportHeight: vp.h,
          safeTop: 47,
          safeBottom: 34,
          copyPreviewPx: feedV2TypicalCopyPx(vp.h),
        })
      ).toBe(true)
      expect(feedV2BottomClearancePx({ safeBottom: 34 })).toBeLessThan(80)
      expect(feedV2ContentBudgetPx({ viewportHeight: vp.h, safeTop: 47, safeBottom: 34 })).toBeGreaterThan(
        400
      )
    }
  })

  it('FullscreenNewsCard protects action zone outside nested copy scroll; coach in chrome', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-action-zone')
    expect(card).toContain('data-feed-first-paint-actions')
    expect(card).toContain('smart-feed-copy-preview')
    expect(card).toContain('smart-feed-copy-scroll')
    expect(card).toContain('--feed-v2-copy-scroll-max')
    expect(card).not.toMatch(/smart-feed-headline[\s\S]{0,400}line-clamp/)
    expect(card).not.toMatch(/smart-feed-summary[\s\S]{0,400}line-clamp/)
    expect(card).toContain('--feed-v2-action-zone')
    // Coach must not live under media absolute layer
    const mediaIdx = card.indexOf('data-testid="smart-feed-media"')
    const coachIdx = card.indexOf('<SwipeDiscoveryCoach')
    const chromeIdx = card.indexOf('feed-v2-card-chrome')
    expect(coachIdx).toBeGreaterThan(chromeIdx)
    expect(coachIdx).toBeGreaterThan(mediaIdx)
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('smart-feed-publisher-row')
  })

  it('does not modify Reader ownership / history modules', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).not.toContain('resolveFeedOwnerHistorySync')
    expect(card).not.toContain('armFeedOwnerRescue')
    expect(card).not.toContain('history.back')
    const history = readFileSync(join(process.cwd(), 'src/lib/feed/reader/history.ts'), 'utf8')
    expect(history).toContain('resolveFeedOwnerHistorySync')
  })
})

describe('P18 swipe discovery V6 visibility', () => {
  it('uses v9 key; prior learned keys cannot suppress', () => {
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v10')
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V1, JSON.stringify({ learned: true, shownCount: 3 }))
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V2, JSON.stringify({ learned: true, shownCount: 3 }))
    expect(priorKeysWouldHaveSuppressedCoach()).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'card-a' })).toBe(true)
  })

  it('travel/duration/settle within contract; painted-rect gate exists', () => {
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(40)
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeLessThanOrEqual(48)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeGreaterThanOrEqual(800)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeLessThanOrEqual(1100)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeGreaterThanOrEqual(400)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeLessThanOrEqual(900)
    expect(isCoachPaintedInViewport(null)).toBe(false)
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('isCoachPaintedInViewport')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('inset-x-0')
    expect(coach).toContain('justify-center')
    expect(coach).toContain('data-swipe-discovery-v10')
    expect(coach).toContain('feed-swipe-discovery-affordance')
  })

  it('eligible across multiple cards before learned; Haberi Oku does not mark', () => {
    for (let i = 0; i < 5; i++) recordSwipeDiscoveryShown()
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'card-a' })).toBe(true)
    resetSwipeDiscoveryPresentation()
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'card-a' })).toBe(true)
    markSwipeDiscoveryLearned('card-a')
    expect(hasFeedCoachShownForArticle('card-a')).toBe(true)
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
    expect(client).toContain('readerDebugQuery')
  })

  it('TRACE exposes coach debug + Replay', () => {
    writeSwipeDiscoveryState({ learned: false, shownCount: 1, version: 10 })
    const survivor = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderNavTraceSurvivor.tsx'),
      'utf8'
    )
    expect(survivor).toContain('Replay Swipe Coach')
    expect(survivor).toContain('readSwipeCoachDebug')
    expect(survivor).toContain('coach:')
  })
})
