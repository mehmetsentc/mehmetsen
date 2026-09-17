/**
 * P19 — Home → Feed V2 must show NaHaber boot splash, not empty black.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Feed V2 branded boot splash', () => {
  it('route loading.tsx paints FeedBootSplash during soft-nav', () => {
    const loading = read('src/app/(main)/feed-v2/loading.tsx')
    expect(loading).toContain('FeedV2BootFallback')
    expect(loading).toContain('FeedV2Loading')
  })

  it('page Suspense fallback + empty SSR use FeedBootSplash', () => {
    const page = read('src/app/(main)/feed-v2/page.tsx')
    const shell = read('src/components/feed/smart/FeedV2RouteShell.tsx')
    expect(page).toContain('Suspense')
    expect(page).toContain('FeedV2BootFallback')
    expect(page).toContain('FeedBootSplash')
    expect(page).toContain('FEED_V2_SSR_BOOT_MS')
    expect(shell).toContain('smart-feed-ssr-shell')
  })

  it('client first-paint loading uses FeedBootSplash', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('isLoadingFirstTime')
    expect(client).toContain('<FeedBootSplash')
    expect(client).toContain('smart-feed-skeleton-view')
  })

  it('splash uses boot-mark PNG + breathe animation hooks', () => {
    const splash = read('src/components/feed/smart/FeedBootSplash.tsx')
    const brand = read('src/components/brand/BrandBootSplash.tsx')
    const logo = read('src/components/brand/BrandLogo.tsx')
    expect(splash).toContain('BrandBootSplash')
    expect(splash).toContain('feed-boot-splash')
    expect(brand).toContain('BrandBootMark')
    expect(logo).toContain('nahaber-boot-mark.png')
    expect(logo).toContain('BRAND_BOOT_MARK_SRC')
    const css = read('src/app/globals.css')
    expect(css).toContain('@keyframes feed-boot-logo-breathe')
    expect(css).toContain('.brand-boot-mark__logo')
  })

  it('root and main loading routes use BrandBootSplash', () => {
    expect(read('src/app/loading.tsx')).toContain('BrandBootSplash')
    expect(read('src/app/(main)/loading.tsx')).toContain('BrandBootSplash')
  })
})
