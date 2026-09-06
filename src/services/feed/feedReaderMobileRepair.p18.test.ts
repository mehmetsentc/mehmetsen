/**
 * P18 — Feed Reader mobile swipe repair + Feed card UX contracts.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/firebase/auth', () => ({
  ensureAuthReady: vi.fn(async () => undefined),
  getClientAuthToken: vi.fn(async () => null as string | null),
  auth: { currentUser: null },
}))

import { READER_GESTURE, shouldCompleteTransition } from '@/lib/feed/reader/gestureArbitration'
import { resolveFeedV2TabForArticleCategory } from '@/lib/feed/feedV2Tabs'
import { classifyFeedOpenGestureDecision, dispatchFeedOpenGesture } from '@/lib/feed/reader/feedOpenGesture'
import { FEED_READER_DURATION_MS } from '@/lib/feed/reader/tokens'

describe('Feed Reader mobile swipe repair contracts', () => {
  it('documents tuned one-handed thresholds (left open only)', () => {
    expect(READER_GESTURE.activatePx).toBe(14)
    expect(READER_GESTURE.completePx).toBe(72)
    expect(READER_GESTURE.completeVelocity).toBe(0.45)
    expect(READER_GESTURE.hardCompleteProgress).toBe(0.32)
    expect(READER_GESTURE.dominance).toBe(1.35)
    // ~125px @390vw hard-complete; velocity branch still available earlier
    expect(shouldCompleteTransition({ progress: 0.32, velocityX: 0 })).toBe(true)
    expect(shouldCompleteTransition({ progress: 0.23, velocityX: 0.45 })).toBe(true)
    expect(shouldCompleteTransition({ progress: 0.1, velocityX: 0 })).toBe(false)
    expect(FEED_READER_DURATION_MS).toBeGreaterThanOrEqual(260)
    expect(FEED_READER_DURATION_MS).toBeLessThanOrEqual(420)
  })

  it('Feed→Reader is left; right swipe does not open', () => {
    expect(
      classifyFeedOpenGestureDecision({
        dx: -140,
        dy: 4,
        startClientX: 200,
        viewportWidth: 390,
        velocityX: -0.2,
      }).open
    ).toBe(true)
    expect(
      classifyFeedOpenGestureDecision({
        dx: 140,
        dy: 4,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: 0.6,
      }).open
    ).toBe(false)
  })

  it('interactive open path locks after horizontal intent (passive:false + preventDefault)', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("{ passive: false }")
    expect(client).toContain('ev.preventDefault()')
    expect(client).toContain('feedToReaderProgress')
    expect(client).toContain('setHorizontalLocked(true)')
    expect(client).toContain("touchAction: horizontalLocked ? 'none'")
    expect(client).toContain('translate3d')
    expect(client).toContain("phase: 'cancel'")
    expect(client).toContain("onOpen: () => onRead(item, index, 'gesture')")
  })

  it('Haberi Oku and gesture share openReader; capability PENDING does not /haber', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("onReadClick={() => onRead(item, index, 'button')}")
    expect(client).toContain("onOpen: () => onRead(item, index, 'gesture')")
    expect(client).toContain("if (decided.decision === 'PENDING') return")
    expect(client).toContain('openReader(item, index)')
    const haber = [...client.matchAll(/router\.push\(ROUTES\.NEWS_DETAIL\([^)]*\)\)/g)]
    expect(haber).toHaveLength(1)
  })

  it('UI-1 category action uses existing Feed tab resolution + gesture exclusion', () => {
    expect(resolveFeedV2TabForArticleCategory('yerel-asayis')?.id).toBeTruthy()
    expect(resolveFeedV2TabForArticleCategory('spor')?.kind).toBe('category')
    expect(resolveFeedV2TabForArticleCategory(null)).toBeNull()

    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('data-testid="smart-feed-category-goto"')
    expect(card).toContain('data-no-reader-gesture="1"')
    expect(card).toContain('Kategoriye Git')
    expect(card).toContain('onCategoryClick')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('resolveFeedV2TabForArticleCategory')
    expect(client).toContain('handleTabChange(tab)')
  })

  it('UI-2 summary→Haberi Oku breathing space + image draggable false', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toMatch(/mt-5[\s\S]*smart-feed-read-cta|smart-feed-read-cta[\s\S]*mt-5/)
    expect(card).toContain('draggable={false}')
  })

  it('SEO: feed-v2 noindex; Reader query is non-canonical; /haber remains SEO surface', () => {
    const feedMeta = readFileSync(join(process.cwd(), 'src/app/(main)/feed-v2/page.tsx'), 'utf8')
    expect(feedMeta).toContain('robots: { index: false, follow: false }')

    const history = readFileSync(join(process.cwd(), 'src/lib/feed/reader/history.ts'), 'utf8')
    expect(history).toContain('non-canonical for SEO')
    expect(history).toContain("reader: slug")

    const haber = readFileSync(join(process.cwd(), 'src/app/(main)/haber/[slug]/page.tsx'), 'utf8')
    expect(haber).toContain('buildNewsArticleJsonLd')
    expect(haber).toContain('buildPostMetadata')
    expect(haber).not.toContain("redirect('/feed-v2")
  })

  it('Reader reverse gesture and error fallback remain Link-not-auto-push', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('readerToFeedProgress')
    expect(reader).toContain('e.preventDefault()')
    expect(reader).toContain('Tam haber sayfasını aç')
    expect(reader).not.toContain('router.push')
  })

  it('dispatch still opens once for qualifying left swipe', () => {
    let n = 0
    expect(
      dispatchFeedOpenGesture({
        dx: -130,
        dy: 6,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: -0.5,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(true)
    expect(n).toBe(1)
  })
})
