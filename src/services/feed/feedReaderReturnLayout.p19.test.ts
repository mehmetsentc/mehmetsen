/**
 * P19 — Feed Reader open/return must not jump the feed stage.
 * AUTOMATED — NOT HUMAN GO.
 *
 * Live repro (mobile): Haberi Oku / Akışa Dön shifted feedTop by ~112px because
 * resolveTopNavbarVisible(false) unmounted Navbar + mobile-chrome-spacer.
 * Keep Navbar mounted; CSS smart-feed-reader-open hides paint/hit-testing.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveSiteChromeVisible,
  resolveTopNavbarVisible,
} from '@/lib/feed/reader/shellChrome'
import { FEED_READER_DURATION_MS } from '@/lib/feed/reader/tokens'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Feed Reader return layout stability', () => {
  it('keeps top Navbar mounted on Feed V2 while Reader is active', () => {
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(true)
    expect(
      resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
  })

  it('CSS still hides painted chrome under smart-feed-reader-open', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('smart-feed-reader-open:has(.content-main-reels) .mobile-top-chrome')
    expect(css).toContain('smart-feed-reader-open:has(.content-main-reels) .mobile-bottom-nav')
    expect(css).toMatch(/visibility:\s*hidden\s*!important/)
  })

  it('page-turn duration stays snappy (sub-second)', () => {
    expect(FEED_READER_DURATION_MS).toBeGreaterThanOrEqual(320)
    expect(FEED_READER_DURATION_MS).toBeLessThanOrEqual(480)
    const tokens = read('src/lib/feed/reader/tokens.ts')
    expect(tokens).toContain("'400ms'")
  })
})
