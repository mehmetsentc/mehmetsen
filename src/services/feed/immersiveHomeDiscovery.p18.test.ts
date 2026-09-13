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
    expect(feed).toContain('useHomeFeedInfinite')
    expect(feed).toContain('HomeDiscoveryMasonry')
    expect(feed).not.toContain('PinterestRanking')
    expect(feed).not.toContain('HomeRankingV2')
    expect(feed).not.toContain('DiscoveryRankingV2')
    expect(feed).toContain('featuredIds.has(item.id)')
  })

  it('does not keep the magazine carousel / Akış heading / mobile finance interruption', () => {
    const feed = read('src/components/home/HomeFeed.tsx')
    expect(feed).not.toContain('FeaturedSlider')
    expect(feed).not.toContain('MobileMagazineFeed')
    expect(feed).not.toContain('BreakingStories')
    expect(feed).not.toMatch(/>Akış</)
    expect(feed).toContain('home-market-ticker-desktop')
    expect(feed).toContain('hidden lg:block')
    expect(feed).toContain('Öne Çıkanlar')
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
