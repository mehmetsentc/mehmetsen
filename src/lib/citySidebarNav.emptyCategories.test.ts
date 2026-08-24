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
  it('always keeps Ana Sayfa, Etkinlik, İş İlanları, İlçeler', () => {
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

  it('shows Spor section only when hasSpor', () => {
    expect(buildCitySectionNavItems({ hasSpor: true }).map((s) => s.id)).toContain('spor')
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
      .href).toBe('/kategori/yerel-duyuru')
    expect(buildCityCategoryNavItems([{ id: 'siyaset', name: 'Siyaset', slug: 'siyaset' }])[0]
      .href).toBe('/kategori/siyaset')
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
    expect(presence.categories.map((c) => c.id)).not.toContain('spor')
  })
})
