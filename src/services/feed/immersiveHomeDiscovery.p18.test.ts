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
    expect(feed).toContain('home-market-ticker')
    expect(feed).not.toContain('hidden lg:block')
    expect(feed.indexOf('<SourceStories')).toBeLessThan(feed.indexOf('<FeaturedSlider'))
    expect(feed.indexOf('<FeaturedSlider')).toBeLessThan(feed.indexOf('<MarketTicker'))
    expect(feed).not.toContain('PinterestRanking')
    expect(feed).not.toMatch(/>Akış</)
    expect(feed).not.toContain('Feed 2')
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

describe('surfaces reuse magazine language except Akış', () => {
  it('category landing and load-more use magazine + stories', () => {
    const landing = read('src/components/category/mobile/MobileCategoryLanding.tsx')
    const loadMore = read('src/components/category/CategoryLoadMore.tsx')
    const desktop = read('src/components/home/desktop/DesktopCategoryPage.tsx')
    const client = read('src/components/category/CategoryPageClient.tsx')
    expect(landing).toContain('SourceStories')
    expect(landing).toContain('MagazineNewsList')
    expect(landing).not.toContain('HomeDiscoveryMasonry')
    expect(loadMore).toContain('MagazineNewsList')
    expect(loadMore).not.toContain('HomeDiscoveryMasonry')
    expect(desktop).toContain('SourceStories')
    expect(desktop).toContain('MagazineNewsList')
    expect(desktop).not.toContain('CategoryExperience')
    expect(client).not.toContain('md:hidden')
    expect(client).toContain('lg:hidden')
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
