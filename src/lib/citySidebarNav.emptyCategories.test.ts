import { describe, expect, it } from 'vitest'
import {
  CITY_ALWAYS_VISIBLE_SECTION_IDS,
  CITY_NEWS_BACKED_SECTION_ID,
} from '@/constants/cityCategories'
import {
  buildCityCategoryNavItems,
  buildCityHeaderNavItems,
  buildCitySectionNavItems,
} from '@/lib/citySidebarNav'
import { deriveCityNavPresenceFromPool } from '@/services/cityNewsService.server'
import type { NewsItem } from '@/types/newsItem'

function item(category: string): NewsItem {
  return {
    id: `id-${category}`,
    title: category,
    slug: category,
    category,
    status: 'published',
    publishedAt: '2026-08-13T00:00:00.000Z',
  } as NewsItem
}

describe('city header empty-category filter', () => {
  it('always keeps Feed, Etkinlik, İş, İlçeler — Eczane after İş on duty cities', () => {
    const sections = buildCitySectionNavItems({ hasSpor: false })
    expect(sections.map((s) => s.id)).toEqual(['feed', 'etkinlik', 'is-ilanlari', 'ilceler'])
    expect(
      buildCitySectionNavItems({ hasSpor: false, citySlug: 'canakkale' }).map((s) => s.id)
    ).toEqual(['feed', 'etkinlik', 'is-ilanlari', 'nobetci-eczaneler', 'ilceler'])
    expect(
      buildCitySectionNavItems({ hasSpor: false, citySlug: 'antalya' }).map((s) => s.id)
    ).toEqual(['feed', 'etkinlik', 'is-ilanlari', 'nobetci-eczaneler', 'ilceler'])
    expect(
      buildCitySectionNavItems({ hasSpor: false, citySlug: 'bursa' }).map((s) => s.id)
    ).not.toContain('nobetci-eczaneler')
    for (const id of CITY_ALWAYS_VISIBLE_SECTION_IDS) {
      expect(sections.some((s) => s.id === id)).toBe(true)
    }
    expect(sections.some((s) => s.id === CITY_NEWS_BACKED_SECTION_ID)).toBe(false)
  })

  it('keeps Spor out of the dock even when the city has spor news', () => {
    expect(buildCitySectionNavItems({ hasSpor: true }).map((s) => s.id)).not.toContain('spor')
    expect(buildCitySectionNavItems({ hasSpor: false }).map((s) => s.id)).not.toContain('spor')
  })

  it('appends only provided (non-empty) news categories after sections', () => {
    const items = buildCityHeaderNavItems(
      [
        { id: 'siyaset', name: 'Siyaset', slug: 'siyaset' },
        { id: 'yerel-duyuru', name: 'Duyuru', slug: 'yerel-duyuru' },
      ],
      { hasSpor: false }
    )
    expect(items.map((i) => i.id)).toEqual([
      'feed',
      'etkinlik',
      'is-ilanlari',
      'ilceler',
      'siyaset',
      'yerel-duyuru',
    ])
    expect(buildCityCategoryNavItems([{ id: 'yerel-duyuru', name: 'Duyuru', slug: 'yerel-duyuru' }])[0]
      .href).toBe('/?category=yerel-duyuru')
    expect(buildCityCategoryNavItems([{ id: 'siyaset', name: 'Siyaset', slug: 'siyaset' }])[0]
      .href).toBe('/?category=siyaset')
  })

  it('deriveCityNavPresenceFromPool detects spor + yerel-duyuru without empty chips', async () => {
    const empty = await deriveCityNavPresenceFromPool([])
    expect(empty).toEqual({ categories: [], hasSpor: false })

    const presence = await deriveCityNavPresenceFromPool([
      item('yerel-duyuru'),
      item('yerel-spor'),
      item('yerel-futbol'),
      item('siyaset'),
    ])
    expect(presence.hasSpor).toBe(true)
    expect(presence.categories.map((c) => c.id)).toContain('yerel-duyuru')
    expect(presence.categories.map((c) => c.id)).toContain('siyaset')
    expect(presence.categories.map((c) => c.id)).toContain('spor')
  })
})

describe('city feed-v2 tabs', () => {
  it('leads with Sana Özel then city categories only', async () => {
    const { buildCityFeedV2Tabs } = await import('@/lib/feed/feedV2Tabs')
    const tabs = buildCityFeedV2Tabs([
      { id: 'siyaset', name: 'Siyaset' },
      { id: 'ekonomi', name: 'Ekonomi' },
    ])
    expect(tabs[0]?.id).toBe('personal')
    expect(tabs.map((t) => t.id)).toEqual(['personal', 'siyaset', 'ekonomi'])
    expect(tabs.some((t) => t.id === 'yerel' || t.id === 'following')).toBe(false)
  })
})
