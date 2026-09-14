/**
 * Ana Sayfa magazine + source-story contracts.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { groupNewsBySource, sourceStoryTour } from '@/lib/home/sourceStories'
import {
  MAGAZINE_CHUNK,
  buildMagazineStream,
  sequentialCategoryLatest,
} from '@/lib/home/magazineStream'
import { fillHomeFeaturedRail } from '@/lib/featuredScope'
import { desktopCategorySlogan } from '@/lib/home/desktopCategoryPortal'
import { HOME_FEATURED_RAIL_LIMIT } from '@/types/newsItem'
import type { NewsItem } from '@/types/newsItem'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

function item(partial: Partial<NewsItem> & { id: string; title: string }): NewsItem {
  return {
    slug: partial.id,
    ...partial,
  }
}

describe('source-grouped stories', () => {
  it('groups by public source label and keeps newest first', () => {
    const groups = groupNewsBySource([
      item({
        id: 'a1',
        title: 'A yeni',
        source: 'Hürriyet (rss)',
        publishedAt: '2026-09-14T10:00:00.000Z',
      }),
      item({
        id: 'b1',
        title: 'B',
        source: 'Sözcü',
        publishedAt: '2026-09-14T09:00:00.000Z',
      }),
      item({
        id: 'a2',
        title: 'A eski',
        source: 'Hürriyet',
        publishedAt: '2026-09-14T08:00:00.000Z',
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]?.label).toBe('Hürriyet')
    expect(groups[0]?.items.map((n) => n.id)).toEqual(['a1', 'a2'])
    expect(sourceStoryTour(groups).map((n) => n.id)).toEqual(['a1', 'b1'])
  })

  it('does not invent a ranking engine on HomeFeed', () => {
    const feed = read('src/components/home/HomeFeed.tsx')
    expect(feed).toContain('SourceStories')
    expect(feed).toContain('groupNewsBySource')
    expect(feed).toContain('useHomeFeedInfinite')
    expect(feed).toContain('buildMagazineStream')
    expect(feed).toContain('MustReadSection')
    expect(feed).not.toContain('HomeDiscoveryMasonry')
    expect(feed).toContain('FeaturedSlider')
    expect(feed).toContain('HOME_FEATURED_RAIL_LIMIT')
    expect(feed).toContain('fillHomeFeaturedRail')
    expect(feed).toContain('sequentialCategoryLatest')
    expect(feed).toContain('home-featured-manset-block')
    expect(feed).toContain('home-market-ticker')
    expect(feed).toContain('<MarketTicker attached')
    expect(feed).not.toContain('hidden lg:block')
    expect(feed.indexOf('<SourceStories')).toBeLessThan(feed.indexOf('<FeaturedSlider'))
    expect(feed.indexOf('<FeaturedSlider')).toBeLessThan(feed.indexOf('<MarketTicker'))
    expect(feed).not.toContain('PinterestRanking')
    expect(feed).not.toMatch(/>Akış</)
    expect(feed).not.toContain('Feed 2')
  })
})

describe('featured manşet presentation', () => {
  it('uses full-bleed headline slides + dots, not equal peek cards', () => {
    const slider = read('src/components/home/FeaturedSlider.tsx')
    const ticker = read('src/components/home/MarketTicker.tsx')
    expect(slider).toContain('home-featured-rail--headline')
    expect(slider).toContain('home-featured-rail-dots')
    expect(slider).toContain('layout="headline"')
    expect(slider).toContain('home-featured-rail__nav')
    expect(slider).not.toContain('layout="featuredRail"')
    const discovery = read('src/components/home/HomeDiscoveryCard.tsx')
    expect(discovery).toContain("FEATURED_RAIL_ASPECT = '16 / 9'")
    expect(discovery).toContain("FEATURED_HEADLINE_ASPECT = '5 / 4'")
    const css = read('src/app/globals.css')
    expect(css).toMatch(
      /\.home-featured-rail--headline \.home-discovery-card__media \{[\s\S]*?aspect-ratio:\s*5 \/ 4/
    )
    expect(css).toContain('.home-featured-rail__dot.is-active')
    expect(css).toMatch(/\.home-featured-rail__dots \{[\s\S]*?background:\s*#2a2a2c/)
    expect(css).toMatch(/\.home-featured-rail--headline \.home-discovery-card__kicker \{[\s\S]*?background:\s*#e11d2e/)
    expect(ticker).toContain('home-market-ticker--attached')
    expect(ticker).toContain('attached')
  })
})

describe('magazine stream', () => {
  it('punctuates latest order with existing category rails every 5 items', () => {
    expect(MAGAZINE_CHUNK).toBe(5)
    const latest = [
      item({ id: '1', title: '1' }),
      item({ id: '2', title: '2' }),
      item({ id: '3', title: '3' }),
      item({ id: '4', title: '4' }),
      item({ id: '5', title: '5' }),
    ]
    const spor = [
      item({ id: 's1', title: 's1' }),
      item({ id: 's2', title: 's2' }),
      item({ id: 's3', title: 's3' }),
      item({ id: 's4', title: 's4' }),
    ]
    const blocks = buildMagazineStream({
      items: latest,
      rails: { spor },
    })
    expect(blocks[0]?.kind).toBe('magazine')
    if (blocks[0]?.kind === 'magazine') expect(blocks[0].items).toHaveLength(5)
    expect(blocks[1]?.kind).toBe('category')
    if (blocks[1]?.kind === 'category') expect(blocks[1].categoryId).toBe('spor')
  })

  it('sequences one latest story from each category in nav order', () => {
    const sequenced = sequentialCategoryLatest([
      item({ id: 'e1', title: 'e1', category: 'ekonomi' }),
      item({ id: 'g1', title: 'g1', category: 'gundem' }),
      item({ id: 's1', title: 's1', category: 'spor' }),
      item({ id: 'e2', title: 'e2', category: 'ekonomi' }),
    ])
    expect(sequenced.map((n) => n.id)).toEqual(['g1', 'e1', 's1', 'e2'])
  })
})

describe('featured rail fill', () => {
  it('fills leftover Öne Çıkan slots from latest without ranking', () => {
    const pins = [
      item({ id: 'p1', title: 'p1', featured: true }),
      item({ id: 'p2', title: 'p2', featured: true }),
    ]
    const latest = Array.from({ length: 22 }, (_, i) =>
      item({ id: `l${i}`, title: `l${i}` })
    )
    const filled = fillHomeFeaturedRail(pins, latest, false, HOME_FEATURED_RAIL_LIMIT)
    expect(filled).toHaveLength(20)
    expect(filled[0]?.id).toBe('p1')
    expect(filled[2]?.id).toBe('l0')
  })
})

describe('surfaces reuse magazine language except Akış and desktop', () => {
  it('mobile category landing and load-more keep magazine + stories', () => {
    const landing = read('src/components/category/mobile/MobileCategoryLanding.tsx')
    const loadMore = read('src/components/category/CategoryLoadMore.tsx')
    const client = read('src/components/category/CategoryPageClient.tsx')
    expect(landing).toContain('SourceStories')
    expect(landing).toContain('MagazineNewsList')
    expect(landing).not.toContain('HomeDiscoveryMasonry')
    expect(loadMore).toContain('MagazineNewsList')
    expect(loadMore).not.toContain('HomeDiscoveryMasonry')
    expect(client).not.toContain('md:hidden')
    expect(client).toContain('lg:hidden')
  })

  it('desktop category page uses the portal hero, not magazine stories', () => {
    const desktop = read('src/components/home/desktop/DesktopCategoryPage.tsx')
    expect(desktop).toContain('DesktopCategoryHero')
    expect(desktop).toContain('desktop-category-portal')
    expect(desktop).toContain('dcp-grid')
    expect(desktop).not.toContain('SourceStories')
    expect(desktop).not.toContain('MagazineNewsList')
    expect(desktop).not.toContain('CategoryExperience')
  })

  it('national /feed keeps magazine HomeFeed on mobile and newspaper on desktop', () => {
    const feed = read('src/components/feed/FeedPageClient.tsx')
    expect(feed).toContain('lg:hidden')
    expect(feed).toContain('<HomeFeed data={liveFeedData} />')
    expect(feed).toContain('DesktopHomeFeed')
    expect(feed).toContain('DesktopNewspaperShell')
    expect(feed).toContain('hidden lg:block')
    expect(feed).not.toContain('HomeDiscoveryMasonry')
    const desktop = read('src/components/home/desktop/DesktopHomeFeed.tsx')
    expect(desktop).toContain('DesktopPortalHome')
    expect(desktop).toContain('uniqueWithImage')
    expect(desktop).toContain('cityMode && layout.featureLead && layout.featureImage')
    expect(desktop).not.toContain('PinterestRanking')
    const portal = read('src/components/home/desktop/DesktopPortalHome.tsx')
    expect(portal).toContain('function withImage')
    expect(portal).not.toContain('FEED_FALLBACK_LOGO')
    expect(read('src/components/home/desktop/DesktopPortalFullHeader.tsx')).not.toContain('DesktopAdBanner')
    const header = read('src/components/home/desktop/DesktopScrollHeader.tsx')
    expect(header).toContain("chrome={portal ? 'portal' : 'default'}")
    expect(feed).toContain('homeFeedData.breaking.length > 0')
    expect(feed).toContain('homeFeedData.latest')
    const types = read('src/types/newsItem.ts')
    const ssrRails = types.slice(
      types.indexOf('HOME_FEED_SSR_RAILS'),
      types.indexOf('HOME_FEED_DESKTOP_LAZY_RAILS')
    )
    expect(ssrRails).toContain("'siyaset'")
  })

  it('Akış client is not rewritten to magazine', () => {
    const akis = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(akis).not.toContain('SourceStories')
    expect(akis).not.toContain('MagazineNewsList')
    expect(akis).toContain('smart-feed-root')
  })

  it('shared category rail order is untouched', () => {
    const shared = read('src/lib/feed/sharedCategoryRail.ts')
    expect(shared).toContain('getSwipeableFeedDestinations')
    expect(shared).toContain("dest.id === SHARED_RAIL_ALL_ID ? 'Tümü'")
  })
})

describe('desktop category portal copy', () => {
  it('keeps slogans as presentation text', () => {
    expect(desktopCategorySlogan('gundem')).toBe('Bugünün gündemi, yarının tarihi')
    expect(desktopCategorySlogan('dunya')).toBe('Dünyayı anlamak, geleceği görmek')
  })
})
