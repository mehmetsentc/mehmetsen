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
  it('keeps category rails exclusive and does not invent Magazin from asayiş', () => {
    expect(CITY_PORTAL_CATEGORIES.filter((c) => c.layout === 'column')).toHaveLength(8)
    expect(CITY_PORTAL_CATEGORIES.filter((c) => c.layout === 'rail').map((c) => c.id)).toEqual([
      'gundem',
      'saglik',
      'yasam',
      'egitim',
      'turizm',
      'magazin',
    ])

    const crash = item('crash', 'asayis')
    const data = {
      featured: [crash],
      latest: [crash, item('late', 'gundem')],
      mostRead: [crash],
      trending: [],
      breaking: [],
      trendFeed: [],
      categoryRails: {
        asayis: [crash],
        'yerel-asayis': [crash],
        'yerel-haber': [crash],
        gundem: [item('g1', 'gundem')],
        spor: [item('s1', 'spor')],
      },
    } as HomeFeedInitialData

    const portal = buildCityPortalHomeProps(data)
    const ids = [
      ...portal.heroSlides,
      ...portal.mansetItems,
      ...portal.mostRead,
      ...portal.categoryCards.flatMap((card) => card.items),
    ].map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(portal.categoryCards.find((card) => card.id === 'magazin')).toBeUndefined()
    expect(portal.categoryCards.find((card) => card.id === 'turizm')).toBeUndefined()
    const asayis = portal.categoryCards.find((card) => card.id === 'asayis')
    expect(asayis?.items.some((entry) => entry.id === 'crash') ?? false).toBe(false)
  })
})
