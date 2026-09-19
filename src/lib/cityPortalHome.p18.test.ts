import { describe, expect, it } from 'vitest'
import { buildCityPortalHomeProps, CITY_PORTAL_CATEGORIES } from '@/lib/cityPortalHome'
import type { HomeFeedInitialData, NewsItem } from '@/types/newsItem'

function item(id: string, category: string, image = true): NewsItem {
  return {
    id,
    slug: id,
    title: `${category} ${id}`,
    category,
    imageUrl: image ? `https://img.test/${id}.jpg` : null,
  } as NewsItem
}

describe('city portal home fill', () => {
  it('covers every city category and does not require clocks', () => {
    expect(CITY_PORTAL_CATEGORIES.map((c) => c.id)).toEqual([
      'gundem',
      'yerel',
      'asayis',
      'dunya',
      'siyaset',
      'ekonomi',
      'spor',
      'teknoloji',
      'kultur',
      'saglik',
      'yasam',
      'egitim',
      'turizm',
      'magazin',
    ])

    const rails = Object.fromEntries(
      CITY_PORTAL_CATEGORIES.map((col) => [col.keys[0], [item(`${col.id}-1`, col.keys[0])]])
    ) as HomeFeedInitialData['categoryRails']

    const data = {
      featured: [item('feat', 'gundem')],
      latest: [item('late', 'gundem')],
      mostRead: [item('read', 'spor')],
      trending: [],
      breaking: [],
      trendFeed: [],
      categoryRails: rails,
    } as HomeFeedInitialData

    const portal = buildCityPortalHomeProps(data)
    expect(portal.categoryCards.length).toBe(CITY_PORTAL_CATEGORIES.length)
    expect(portal.mansetItems.length).toBeGreaterThan(0)
    expect(portal.mostRead.length).toBeGreaterThan(0)
  })
})
