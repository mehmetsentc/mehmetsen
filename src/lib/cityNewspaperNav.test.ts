import { describe, expect, it } from 'vitest'
import { buildCityNewspaperNav, CITY_NEWSPAPER_NAV } from '@/lib/cityNewspaperNav'

describe('buildCityNewspaperNav', () => {
  it('uses local city chips instead of national Dünya / Video / Teknoloji', () => {
    const hrefs = CITY_NEWSPAPER_NAV.map((item) => item.href)
    const labels = CITY_NEWSPAPER_NAV.map((item) => item.label)
    expect(labels[0]).toBe('Ana Sayfa')
    expect(labels).toContain('Güncel')
    expect(labels).toContain('Turizm')
    expect(labels).toContain('Duyuru')
    expect(hrefs).not.toContain('/kategori/dunya')
    expect(hrefs).not.toContain('/kategori/video')
    expect(hrefs).not.toContain('/kategori/teknoloji')
    expect(hrefs).not.toContain('/kategori/yerel-haber')
  })

  it('keeps only published city categories when a live list is provided', () => {
    const items = buildCityNewspaperNav(
      [
        { id: 'gundem', name: 'Güncel', slug: 'gundem' },
        { id: 'turizm', name: 'Turizm', slug: 'turizm' },
      ],
      { hasSpor: true }
    )
    expect(items.map((item) => item.label)).toEqual(['Ana Sayfa', 'Güncel', 'Turizm', 'Spor'])
  })
})
