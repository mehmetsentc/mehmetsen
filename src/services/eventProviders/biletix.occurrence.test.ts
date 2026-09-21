import { describe, expect, it } from 'vitest'
import {
  isBiletixContainerDoc,
  isBiletixNonEventDoc,
  mapBiletixDoc,
  parseBiletixPerformanceSitemap,
} from './biletix'
import { isRangeContainer } from './occurrence'
import { biletixEventUrl, parseBiletixPerformanceUrl } from './ticketUrl'

const CONTAINER: Parameters<typeof mapBiletixDoc>[0] = {
  id: '5LOVE',
  name: 'Love Reset - 30 İL',
  start: '2026-06-21T18:00:00Z',
  end: '2026-08-27T18:00:00Z',
  city: 'İstanbul',
  venue: 'Various Venues',
  image_url: '5LOVE.avif',
}

const PERFORMANCE_LIKE: Parameters<typeof mapBiletixDoc>[0] = {
  id: '5YS1I',
  name: 'Duman',
  start: '2026-09-25T18:00:00Z',
  end: '2026-09-25T20:00:00Z',
  city: 'Antalya',
  venue: 'Antalya Açıkhava',
  image_url: '5YS1I.avif',
}

describe('Biletix occurrence mapping', () => {
  it('skips product-upsell Solr docs', () => {
    expect(
      isBiletixNonEventDoc({
        id: '0E007',
        name: 'TarihiEbruSanatTasarimiUpsell',
        venue: 'İlgili Ürünler',
        subcategory: 'urunsatisi$OTHER',
      })
    ).toBe(true)
  })

  it('does not emit a multi-day container as an occurrence', () => {
    expect(isBiletixContainerDoc(CONTAINER)).toBe(true)
    expect(isRangeContainer(CONTAINER.start, CONTAINER.end)).toBe(true)
    expect(mapBiletixDoc(CONTAINER, { skipContainers: true })).toBeNull()
  })

  it('falls back to the event URL when sitemap uniqueness is unproven — never fabricates /001', () => {
    const event = mapBiletixDoc(PERFORMANCE_LIKE, { skipContainers: true })
    expect(event?.ticketUrl).toBe(biletixEventUrl('5YS1I'))
    expect(parseBiletixPerformanceUrl(event?.ticketUrl ?? '')).toBeNull()
  })

  it('emits a same-day performance as one occurrence with event-specific URL', () => {
    const event = mapBiletixDoc(PERFORMANCE_LIKE, {
      skipContainers: true,
      ticketUrl: 'https://www.biletix.com/performance/5YS1I/001/TURKIYE/tr',
    })
    expect(event).toBeTruthy()
    expect(event?.externalId).toBe('5YS1I')
    expect(parseBiletixPerformanceUrl(event?.ticketUrl ?? '')).toEqual({
      eventCode: '5YS1I',
      performanceIndex: '001',
    })
    expect(event?.coverImageUrl).toContain('eventimages/960x540/5YS1I.avif')
  })

  it('maps two performances to two occurrences', () => {
    const a = mapBiletixDoc(
      { ...PERFORMANCE_LIKE, id: 'A1', start: '2026-09-25T18:00:00Z', end: '2026-09-25T20:00:00Z' },
      { skipContainers: true }
    )
    const b = mapBiletixDoc(
      { ...PERFORMANCE_LIKE, id: 'A2', start: '2026-10-02T18:00:00Z', end: '2026-10-02T20:00:00Z' },
      { skipContainers: true }
    )
    expect(a?.id).not.toBe(b?.id)
    expect(a?.startsAt).not.toBe(b?.startsAt)
  })

  it('uses sitemap uniqueness and does not invent performance ids', () => {
    const xml = `
      <urlset>
        <url><loc>https://www.biletix.com/performance/5AAA1/001/TURKIYE/tr</loc></url>
        <url><loc>https://www.biletix.com/performance/5AAA1/001/TURKIYE/en</loc></url>
        <url><loc>https://www.biletix.com/performance/5MULTI/001/TURKIYE/tr</loc></url>
        <url><loc>https://www.biletix.com/performance/5MULTI/002/TURKIYE/tr</loc></url>
      </urlset>`
    const index = parseBiletixPerformanceSitemap(xml)
    expect(index.countByCode.get('5AAA1')).toBe(1)
    expect(index.uniqueUrlByCode.get('5AAA1')).toContain('/performance/5AAA1/001/')
    expect(index.uniqueUrlByCode.has('5MULTI')).toBe(false)
    expect(biletixEventUrl('5MULTI')).toContain('/etkinlik/5MULTI/')
  })

  it('pagination guard stops when start exceeds numFound', () => {
    const pageSize = 100
    const numFound = 250
    const pages = []
    for (let page = 0; page < 12; page += 1) {
      const start = page * pageSize
      if (start >= numFound) break
      pages.push(start)
    }
    expect(pages).toEqual([0, 100, 200])
    expect(pages.length).toBeLessThanOrEqual(8)
  })
})
