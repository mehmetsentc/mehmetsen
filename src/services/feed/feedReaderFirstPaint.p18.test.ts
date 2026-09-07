/**
 * P18 Feed V2 mobile first-paint + portrait — AUTOMATED (not HUMAN GO).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_V2_LAYOUT_TEST_VIEWPORTS,
  feedV2ElementInFirstPaint,
  feedV2FirstPaintFits,
  feedV2HeroMinPx,
  feedV2TypicalCopyPx,
  feedV2ActionZonePx,
} from '@/lib/feed/reader/feedChrome'
import {
  isFeedPortraitStandaloneContext,
  tryLockFeedPortraitOrientation,
} from '@/lib/feed/reader/feedPortrait'

const root = process.cwd()

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('P18 Feed V2 first-paint vertical budget', () => {
  it('typical copy + actions fit without nested scroll on all mobile viewports', () => {
    for (const vp of FEED_V2_LAYOUT_TEST_VIEWPORTS) {
      const copyPx = feedV2TypicalCopyPx(vp.h)
      const hero = feedV2HeroMinPx(vp.h)
      expect(
        feedV2FirstPaintFits({
          viewportHeight: vp.h,
          safeTop: 47,
          safeBottom: 34,
          topChromePx: 56,
          copyPx,
          actionZonePx: feedV2ActionZonePx(),
          heroMinPx: hero,
        })
      ).toBe(true)
      // Hero must yield on short phones (was ~28–34dvh before)
      if (vp.h <= 700) expect(hero).toBeLessThanOrEqual(Math.round(vp.h * 0.16))
    }
  })

  it('bounding-rect first-paint helper rejects publisher below safe bottom', () => {
    expect(
      feedV2ElementInFirstPaint({
        top: 600,
        bottom: 648,
        viewportHeight: 667,
        contentTop: 56,
        safeBottomInset: 34,
      })
    ).toBe(false)
    expect(
      feedV2ElementInFirstPaint({
        top: 520,
        bottom: 568,
        viewportHeight: 667,
        contentTop: 56,
        safeBottomInset: 34,
      })
    ).toBe(true)
  })

  it('action zone is outside nested copy scroll; no line-clamp', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    const scrollIdx = card.indexOf('data-testid="smart-feed-copy-scroll"')
    const scrollCloseHint = card.indexOf('data-feed-first-paint-actions="1"')
    const actionIdx = card.indexOf('data-testid="smart-feed-action-zone"')
    const pubIdx = card.indexOf('data-testid="smart-feed-publisher-row"')
    expect(scrollIdx).toBeGreaterThan(0)
    expect(scrollCloseHint).toBeGreaterThan(scrollIdx)
    expect(actionIdx).toBeGreaterThan(scrollCloseHint - 80)
    expect(pubIdx).toBeGreaterThan(actionIdx)
    expect(card).toContain('--feed-v2-copy-scroll-max')
    expect(card).toContain('data-feed-nested-scroll="1"')
    expect(card).not.toMatch(/smart-feed-headline[\s\S]{0,400}line-clamp/)
    expect(card).not.toMatch(/smart-feed-summary[\s\S]{0,400}line-clamp/)
    expect(card).not.toMatch(/item\.summary\.slice|item\.summary\.substring/)
  })

  it('reels main height accounts for mobile top chrome offset (no 100dvh under spacer)', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('--mobile-top-chrome-offset')
    expect(css).toContain('content-main-reels')
    expect(css).toMatch(
      /\.content-main-reels[\s\S]{0,500}--feed-card-h:\s*calc\(100dvh - var\(--mobile-top-chrome-offset/
    )
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('--mobile-top-chrome-offset')
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('h-full min-h-0')
    expect(client).toContain('visibleBand')
  })
})

describe('P18 Feed V2 portrait-first', () => {
  it('manifest prefers portrait-primary; Safari lock is not claimed as LOCKED', async () => {
    const manifest = read('public/manifest.webmanifest')
    expect(manifest).toContain('"orientation": "portrait-primary"')
    const css = read('src/app/globals.css')
    expect(css).toContain('portrait-first landscape fallback')
    expect(css).toContain('orientation: landscape')
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('tryLockFeedPortraitOrientation')

    // Browser (non-standalone) must skip — not claim locked
    expect(isFeedPortraitStandaloneContext()).toBe(false)
    const status = await tryLockFeedPortraitOrientation()
    expect(['skipped_browser', 'skipped_ssr', 'unsupported', 'failed']).toContain(status)
    expect(status).not.toBe('locked')
  })
})
