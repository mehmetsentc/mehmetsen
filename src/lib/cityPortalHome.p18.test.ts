import { describe, expect, it } from 'vitest'
import {
  buildCityPortalHomeProps,
  CITY_PORTAL_CATEGORIES,
  packNewspaperCategoryLayout,
} from '@/lib/cityPortalHome'
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

  it('fills a leftover Kültür row from the next rails instead of leaving a hole', () => {
    const columns = ['asayis', 'siyaset', 'ekonomi', 'spor', 'kultur'].map((id) => ({ id }))
    const rails = ['yasam', 'egitim'].map((id) => ({ id }))
    const packed = packNewspaperCategoryLayout(columns, rails)
    expect(packed.gridCards.map((card) => card.id)).toEqual([
      'asayis',
      'siyaset',
      'ekonomi',
      'spor',
    ])
    expect(packed.leftoverGrid.map((card) => card.id)).toEqual(['kultur', 'yasam', 'egitim'])
    expect(packed.leftoverRails).toEqual([])
    expect(packed.restRails).toEqual([])
  })

  it('turns a lone leftover column into a rail', () => {
    const packed = packNewspaperCategoryLayout([{ id: 'kultur' }], [])
    expect(packed.gridCards).toEqual([])
    expect(packed.leftoverGrid).toEqual([])
    expect(packed.leftoverRails.map((card) => card.id)).toEqual(['kultur'])
  })
})
