/**
 * Phase 2 — Ana Sayfa visual discovery contracts. AUTOMATED.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('immersive home discovery Phase 2', () => {
  it('reuses featured pins + home latest order, not a new ranking engine', () => {
    const feed = read('src/components/home/HomeFeed.tsx')
    expect(feed).toContain('pickHomeFeedFeaturedPins')
    expect(feed).toContain('FEATURED_CAROUSEL_LIMIT')
    expect(feed).toContain('useHomeFeedInfinite')
    expect(feed).toContain('HomeDiscoveryMasonry')
    expect(feed).toContain('FeaturedSlider')
    expect(feed).toContain('buildDiscoveryStream')
    expect(feed).toContain('HomeCategoryFeaturedRail')
    expect(feed).not.toContain('PinterestRanking')
    expect(feed).not.toContain('HomeRankingV2')
    expect(feed).not.toContain('DiscoveryRankingV2')
    expect(feed).toContain('featuredIds.has(item.id)')
  })

  it('keeps first featured as a 10-item swipe rail, then masonry — no magazine / Akış heading', () => {
    const feed = read('src/components/home/HomeFeed.tsx')
    const slider = read('src/components/home/FeaturedSlider.tsx')
    expect(feed).toContain('FeaturedSlider')
    expect(feed).not.toContain('MobileMagazineFeed')
    expect(feed).not.toContain('BreakingStories')
    expect(feed).not.toMatch(/>Akış</)
    expect(feed).toContain('home-market-ticker-desktop')
    expect(feed).toContain('hidden lg:block')
    expect(feed).toContain('home-featured-carousel')
    expect(slider).toContain('home-featured-rail')
    expect(slider).toContain('home-featured-rail__scroller')
    expect(slider).not.toContain('FeaturedNewsCarousel')
    expect(slider).toContain('layout="featuredRail"')
    expect(slider).toContain('FEATURED_CAROUSEL_LIMIT')
    const css = read('src/app/globals.css')
    expect(css).toContain('.home-featured-rail__scroller')
    expect(css).toContain('overflow-x: auto')
    expect(css).toContain('.home-featured-rail .home-discovery-card__media')
    expect(css).toContain('aspect-ratio: 4 / 5')
  })

  it('masonry uses AdaptiveMasonry CSS columns at 2-up on mobile', () => {
    const masonry = read('src/components/home/HomeDiscoveryMasonry.tsx')
    const css = read('src/app/globals.css')
    expect(masonry).toContain('exp-masonry exp-masonry--discovery')
    expect(css).toContain('.exp-masonry.exp-masonry--discovery')
    expect(css).toMatch(
      /\.exp-masonry\.exp-masonry--discovery\s*\{[^}]*column-count:\s*2/
    )
  })

  it('cards are image-first with SafeNewsImage overlay copy', () => {
    const card = read('src/components/home/HomeDiscoveryCard.tsx')
    expect(card).toContain('SafeNewsImage')
    expect(card).toContain('home-discovery-card__scrim')
    expect(card).toContain('home-discovery-card__headline')
    expect(card).not.toMatch(/from ['"]next\/image['"]/)
    expect(card).toContain('discoveryAspectRatio')
    expect(card).toContain('FEATURED_RAIL_ASPECT')
    expect(card).toContain("layout === 'featuredRail'")
  })

  it('Ana Sayfa first content is not pulled under the fixed chrome', () => {
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    const css = read('src/app/globals.css')
    expect(layout).toContain('data-header-bleed="0"')
    expect(css).toContain("[data-header-bleed='1'] .content-main-newspaper")
    expect(css).toContain('--mobile-top-chrome-offset')
    expect(css).not.toMatch(/home-feed[^{]*\{[^}]*padding-top:\s*116px/)
  })

  it('/feed homepage uses the discovery wall on all viewports', () => {
    const client = read('src/components/feed/FeedPageClient.tsx')
    expect(client).toContain('<HomeFeed data={liveFeedData} />')
    expect(client).not.toContain('DesktopNewspaperShell')
    expect(client).not.toContain('DesktopHomeFeed')
  })
})
