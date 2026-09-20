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
    expect(portal.categoryCards.find((card) => card.id === 'magazin')).toBeUndefined()
    expect(portal.categoryCards.find((card) => card.id === 'turizm')).toBeUndefined()
    const asayis = portal.categoryCards.find((card) => card.id === 'asayis')
    expect(asayis?.items[0]?.id).toBe('crash')
    expect((asayis?.items.length ?? 0) >= 1).toBe(true)
    const columnIds = portal.categoryCards.flatMap((card) => card.items.map((entry) => `${card.id}:${entry.id}`))
    expect(new Set(columnIds).size).toBe(columnIds.length)
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
    expect(packed.leftoverGrid.map((card) => card.id)).toEqual(['kultur', 'yasam'])
    expect(packed.leftoverRails.map((card) => card.id)).toEqual(['egitim'])
    expect(packed.restRails).toEqual([])
  })

  it('turns a lone leftover column into a rail', () => {
    const packed = packNewspaperCategoryLayout([{ id: 'kultur' }], [])
    expect(packed.gridCards).toEqual([])
    expect(packed.leftoverGrid).toEqual([])
    expect(packed.leftoverRails.map((card) => card.id)).toEqual(['kultur'])
  })

  it('fills a Siyaset column from yerel-siyaset city rails', () => {
    const data = {
      featured: [item('hero', 'gundem')],
      latest: [item('late', 'gundem')],
      mostRead: [],
      trending: [],
      breaking: [],
      trendFeed: [],
      categoryRails: {
        gundem: [item('hero', 'gundem'), item('late', 'gundem')],
        'yerel-siyaset': [item('s1', 'yerel-siyaset'), item('s2', 'yerel-siyaset')],
      },
    } as HomeFeedInitialData

    const portal = buildCityPortalHomeProps(data)
    expect(portal.categoryCards.find((card) => card.id === 'siyaset')?.items.map((entry) => entry.id).slice(0, 2)).toEqual([
      's1',
      's2',
    ])
  })

  it('packs Çanakkale-style rails into a full 4-up newspaper row', () => {
    const data = {
      featured: [item('hero', 'yerel-meteoroloji')],
      latest: [item('late', 'yerel-haber'), item('as1', 'yerel-asayis')],
      mostRead: [item('hero', 'yerel-meteoroloji')],
      trending: [],
      breaking: [],
      trendFeed: [],
      categoryRails: {
        siyaset: [item('s1', 'yerel-siyaset'), item('s2', 'yerel-siyaset')],
        asayis: [item('as1', 'yerel-asayis'), item('as2', 'yerel-asayis')],
        ekonomi: [item('e1', 'yerel-ekonomi')],
        yasam: [item('y1', 'yerel-yasam')],
        egitim: [item('ed1', 'yerel-egitim')],
        kultur: [item('k1', 'yerel-kultur')],
      },
    } as HomeFeedInitialData

    const portal = buildCityPortalHomeProps(data)
    const columns = portal.categoryCards.filter((card) => card.layout === 'column')
    const fill = [
      { id: 'yasam', items: portal.yasamItems },
      { id: 'egitim', items: portal.egitimItems },
    ].filter((card) => card.items.length > 0 && !columns.some((col) => col.id === card.id))
    const packed = packNewspaperCategoryLayout(columns, fill)
    expect(columns.map((card) => card.id)).toEqual(
      expect.arrayContaining(['siyaset', 'asayis', 'ekonomi', 'kultur'])
    )
    expect(packed.gridCards.length % 4).toBe(0)
    expect(packed.leftoverGrid.length === 1).toBe(false)
    expect(packed.leftoverRails.length).toBeLessThanOrEqual(1)
  })

  it('fills a thin Siyaset column with older leftover city news', () => {
    const older = Array.from({ length: 14 }, (_, index) => item(`old-${index}`, 'yerel-duyuru'))
    const data = {
      featured: [item('hero', 'gundem')],
      latest: older,
      mostRead: [],
      trending: [],
      breaking: [],
      trendFeed: [],
      categoryRails: {
        siyaset: [item('s1', 'yerel-siyaset')],
        'yerel-duyuru': older,
      },
    } as HomeFeedInitialData

    const portal = buildCityPortalHomeProps(data)
    const siyaset = portal.categoryCards.find((card) => card.id === 'siyaset')
    expect(siyaset?.items[0]?.id).toBe('s1')
    expect(siyaset?.items.length).toBeGreaterThanOrEqual(6)
    expect(siyaset?.items.some((entry) => entry.id.startsWith('old-'))).toBe(true)
  })

  it('packs leftover rails into a stretched row instead of sparse bands', () => {
    const columns = ['asayis', 'siyaset', 'ekonomi', 'spor'].map((id) => ({ id }))
    const rails = ['turizm', 'egitim'].map((id) => ({ id }))
    const packed = packNewspaperCategoryLayout(columns, rails)
    expect(packed.gridCards.map((card) => card.id)).toEqual([
      'asayis',
      'siyaset',
      'ekonomi',
      'spor',
    ])
    expect(packed.leftoverGrid.map((card) => card.id)).toEqual(['turizm', 'egitim'])
    expect(packed.leftoverRails).toEqual([])
    expect(packed.restRails).toEqual([])
  })

  it('fills a leftover Teknoloji row from the next rails instead of leaving a hole', () => {
    const columns = ['siyaset', 'ekonomi', 'dunya', 'spor', 'teknoloji'].map((id) => ({ id }))
    const rails = ['kultur', 'saglik', 'yasam'].map((id) => ({ id }))
    const packed = packNewspaperCategoryLayout(columns, rails)
    expect(packed.gridCards.map((card) => card.id)).toEqual([
      'siyaset',
      'ekonomi',
      'dunya',
      'spor',
      'teknoloji',
      'kultur',
      'saglik',
      'yasam',
    ])
    expect(packed.leftoverGrid).toEqual([])
    expect(packed.leftoverRails).toEqual([])
    expect(packed.restRails).toEqual([])
  })
})
