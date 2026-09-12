/**
 * P17c — Feed category highlights rail (reference-image composition).
 * Reader variant visual delta must remain 0 vs 6cea7d9 editorial stack.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatFeedHighlightsHeading,
  resolveFeedHighlightsCategoryLabel,
} from '@/lib/feed/feedHighlightsHeading'
import {
  shouldIgnoreSystemBackEdge,
  shouldIgnoreSystemBackEdgeForReaderReturn,
} from '@/lib/feed/reader/gestureArbitration'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P17c Feed highlights heading', () => {
  it('dynamic category headings from taxonomy', () => {
    expect(formatFeedHighlightsHeading('yerel-yasam')).toBe('Yerel Yaşamda Öne Çıkanlar')
    expect(formatFeedHighlightsHeading('spor')).toBe('Sporda Öne Çıkanlar')
    expect(formatFeedHighlightsHeading('teknoloji')).toBe('Teknolojide Öne Çıkanlar')
    expect(formatFeedHighlightsHeading('saglik')).toBe('Sağlıkta Öne Çıkanlar')
    expect(formatFeedHighlightsHeading(null)).toBe('Öne Çıkanlar')
    expect(resolveFeedHighlightsCategoryLabel('spor')).toBeTruthy()
  })
})

describe('P17c Feed rail presentation', () => {
  it('feed presentation uses 2.2-card sizing + see-all row', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain("data-feed-highlights-layout={isReader ? undefined : 'ref-2p2'}")
    expect(rail).toContain('w-[calc((100%-1.25rem)/2.2)]')
    expect(rail).toContain('aspect-[16/10]')
    expect(rail).toContain('line-clamp-2')
    expect(rail).toContain('smart-feed-discovery-see-all')
    expect(rail).toContain('Tümünü Gör')
    expect(rail).toContain('data-no-reader-gesture')
    expect(rail).toContain('touch-pan-x')
    // Old tiny strip gone from feed branch.
    expect(rail).not.toMatch(/h-36 w-28/)
  })

  it('Reader variant editorial stack unchanged (6cea7d9)', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('data-reader-rec-layout="editorial-stack"')
    expect(rail).toContain('aspect-[16/9]')
    expect(rail).toContain('Bu konuda daha fazlası')
    expect(rail).toContain('min-h-[11rem]')
    expect(rail).toContain('text-[1.0625rem]')
    expect(rail).toContain('gap-6')
    expect(rail).toContain("isReader ? {} : { 'data-no-reader-gesture': '1' }")
  })

  it('summary clamp + rail outside nested scroll + Haberi Oku safe', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain("showDiscoveryRail ? 'line-clamp-4'")
    expect(card).toContain('data-feed-summary-clamp')
    expect(card).toContain('smart-feed-discovery-slot')
    expect(card).toContain('onSeeAll={onCategoryClick}')
    // Rail must not live inside copy-scroll block after clamp change.
    const slotIdx = card.indexOf('smart-feed-discovery-slot')
    const scrollIdx = card.indexOf('smart-feed-copy-scroll')
    const actionIdx = card.indexOf('smart-feed-action-zone')
    expect(slotIdx).toBeGreaterThan(scrollIdx)
    expect(actionIdx).toBeGreaterThan(slotIdx)
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('pr-[3.5rem]')
  })

  it('cadence preserved via shouldShowFeedHighlights (every 8th)', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('shouldShowFeedHighlights')
    const elig = read('src/lib/feed/feedHighlightsEligibility.ts')
    expect(elig).toContain('FEED_HIGHLIGHTS_CADENCE = 8')
    expect(elig).toContain('(index + 1) % FEED_HIGHLIGHTS_CADENCE !== 0')
  })

  it('gesture / coach / single-reader / PWA contracts preserved', () => {
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(4, 390, { standalone: true })
    ).toBe(false)
    expect(shouldIgnoreSystemBackEdge(4, 390)).toBe(true)
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    expect(client).toContain('READER_GESTURE.peekProgress')
    expect(client).toContain('markSwipeDiscoveryLearned(item.articleId)')
    const swipe = read('src/lib/feed/reader/swipeDiscoveryCoach.ts')
    expect(swipe).toContain('FEED_COACH_SESSION_MAX_IDS')
    expect(swipe).toContain('markFeedCoachHandledForArticle')
  })
})
