/**
 * P18 — Feed V2 human UX: nav-safe layout + Discovery Reader open + swipe coach V2.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_V2_LAYOUT_TEST_HEIGHTS,
  feedV2BottomClearancePx,
} from '@/lib/feed/reader/feedChrome'
import {
  markSwipeDiscoveryLearned,
  readSwipeDiscoveryState,
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_CARD_NUDGE_PX,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_TRAVEL_PX,
  writeSwipeDiscoveryState,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

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

describe('nav-safe Feed card layout', () => {
  it('reserves bottom clearance above MobileNav for all matrix heights', () => {
    for (const h of FEED_V2_LAYOUT_TEST_HEIGHTS) {
      const clearance = feedV2BottomClearancePx({
        pillH: 56,
        floatGap: 10,
        safeBottom: 34,
        breathPx: 16,
      })
      // Interactive content ends ≥12px above pill after safe-area.
      expect(clearance).toBeGreaterThanOrEqual(56 + 10 + 34 + 12)
      expect(h).toBeGreaterThan(clearance + 200)
    }
  })

  it('FullscreenNewsCard uses feed-v2-bottom-clearance and nav-safe marker', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('FEED_V2_CHROME_CSS_VARS')
    expect(card).toContain('pb-[var(--feed-v2-bottom-clearance)]')
    expect(card).toContain('data-feed-v2-nav-safe="1"')
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('smart-feed-publisher-row')
  })
})

describe('DiscoveryRail Reader authority when enabled', () => {
  it('uses button + onOpenArticle when Reader enabled; Link only as guest fallback', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedDiscoveryRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('onOpenArticle')
    expect(rail).toContain('data-discovery-open="reader"')
    expect(rail).toContain('data-discovery-open="canonical"')
    expect(rail).toContain('href={`/haber/${item.slug || item.articleId}`}')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('onDiscoveryArticleOpen')
    expect(client).toContain("onRead(synthetic, index, 'button')")
  })

  it('Haberi Oku remains a button (no nested /haber Link)', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    const idx = card.indexOf('data-testid="smart-feed-read-cta"')
    expect(idx).toBeGreaterThan(0)
    const window = card.slice(Math.max(0, idx - 160), idx + 280)
    expect(window).toContain('<button')
    expect(window).toContain('onClick={onReadClick}')
    expect(window).not.toMatch(/href=\{[^}]*haber/)
  })
})

describe('Swipe Discovery V2', () => {
  it('copy Haberi aç, LEFT travel, pointer-events none, capability gated', () => {
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('Haberi aç')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('data-swipe-discovery-v2="1"')
    expect(coach).not.toContain('preventDefault')
    expect(coach).not.toContain('addEventListener')
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(30)
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeLessThanOrEqual(40)
    expect(SWIPE_DISCOVERY_CARD_NUDGE_PX).toBeGreaterThanOrEqual(8)
    expect(SWIPE_DISCOVERY_CARD_NUDGE_PX).toBeLessThanOrEqual(12)
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toMatch(
      /showSwipeDiscoveryCoach=\{\s*Boolean\(\s*feedReaderEnabled\s*&&\s*readerCapabilityReady/
    )
  })

  it('LEFT open marks learned; Haberi Oku path does not call mark on button alone in openReader', () => {
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    recordSwipeDiscoveryShown()
    markSwipeDiscoveryLearned()
    expect(readSwipeDiscoveryState().learned).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)
    writeSwipeDiscoveryState({ learned: false, shownCount: 0 })
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("if (openSource === 'swipe') markSwipeDiscoveryLearned()")
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toContain('SwipeDiscovery')
  })
})

describe('shell + open authority preserved', () => {
  it('navbar authority and capability latch remain', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src/components/layout/MainLayoutClient.tsx'),
      'utf8'
    )
    expect(layout).toContain('resolveSiteChromeVisible')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('capabilitySessionRef')
    expect(client).toContain('ERROR_RETAIN_FEED')
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('pendingHistoryPlanRef')
    expect(reader).toMatch(/touchAction:\s*['"]pan-y['"]/)
  })
})
