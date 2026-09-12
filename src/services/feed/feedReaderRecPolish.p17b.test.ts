/**
 * P17b — Reader recommendation visual polish (variant="reader" only).
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEED_READER_CSS_VARS } from '@/lib/feed/reader/tokens'
import {
  shouldIgnoreSystemBackEdge,
  shouldIgnoreSystemBackEdgeForReaderReturn,
} from '@/lib/feed/reader/gestureArbitration'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P17b Reader recommendation editorial polish', () => {
  it('1: reader variant uses full-width editorial stack (not 88px thumb row)', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('data-reader-rec-layout="editorial-stack"')
    expect(rail).toContain('aspect-[16/9]')
    expect(rail).toContain('feed-reader-discovery-media')
    expect(rail).toContain('line-clamp-3')
    expect(rail).toContain('text-[1.0625rem]')
    expect(rail).toContain('gap-6')
    expect(rail).toContain('min-h-[11rem]')
    // Old cramped strip must be gone from reader branch.
    expect(rail).not.toMatch(/isReader[\s\S]{0,400}h-\[5\.5rem\] w-\[5\.5rem\]/)
  })

  it('2: default Feed variant remains horizontal rail', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('smart-feed-discovery-scroll')
    expect(rail).toContain('touch-pan-x')
    expect(rail).toContain('data-feed-highlights-visible-target="2.2"')
    expect(rail).toContain('formatFeedHighlightsHeading')
  })

  it('3-4: headline clamp + image cover/fallback controlled', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('feed-reader-discovery-headline')
    expect(rail).toContain('object-cover')
    expect(rail).toContain('feed-reader-discovery-media-fallback')
    expect(rail).toContain('Bu konuda daha fazlası')
  })

  it('5-7: natural flow + footer clearance + no nested vertical scroll', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('data-testid="feed-reader-recommendations"')
    expect(reader).toContain('variant="reader"')
    expect(reader).toContain('feed-reader-footer-clearance')
    expect(FEED_READER_CSS_VARS['--reader-footer-clearance']).toContain('safe-area-inset-bottom')
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    // Reader list is flex-col in document flow — not overflow-y nested scroller.
    expect(rail).toContain('data-testid="feed-reader-discovery-list"')
    expect(rail).not.toMatch(/feed-reader-discovery-list[\s\S]{0,80}overflow-y/)
  })

  it('8-10: empty omits; layout scales with item count (no stretch hack)', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain("loadState === 'empty'")
    expect(rail).toContain('return null')
    expect(rail).not.toContain('flex-1 stretch')
    expect(rail).toContain('items.map')
  })

  it('11: recommendation open preserves single Reader', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('onOpenRelatedArticle')
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    expect(client.match(/<FeedArticleReader/g)?.length).toBe(1)
  })

  it('12-15: gesture / PWA / Safari / scroll contracts untouched', () => {
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(4, 390, { standalone: true })
    ).toBe(false)
    expect(shouldIgnoreSystemBackEdge(4, 390)).toBe(true)
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain("touchAction: returnHorizontalLocked ? 'none' : 'pan-y'")
    expect(reader).toContain('feed-reader-scroll')
    expect(reader).toContain('overflow-y-auto')
  })

  it('16-18: coach + peek frozen', () => {
    const swipe = read('src/lib/feed/reader/swipeDiscoveryCoach.ts')
    expect(swipe).toContain('markFeedCoachHandledForArticle')
    expect(swipe).toContain('FEED_COACH_SESSION_MAX_IDS')
    const ret = read('src/lib/feed/reader/readerReturnCoach.ts')
    expect(ret).toContain('readerCoachScopeKey')
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('READER_GESTURE.peekProgress')
  })

  it('19-21: comments / share / history not touched by this polish', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('/api/feed/v2/rails')
    expect(rail).toContain('?category=')
    // No blanket section gesture block.
    expect(rail).toContain("isReader ? {} : { 'data-no-reader-gesture': '1' }")
    const share = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(share).toContain('PostShareButton')
  })
})
