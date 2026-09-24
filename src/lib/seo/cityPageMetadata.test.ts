import { describe, expect, it } from 'vitest'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { CITY_CATEGORY_CHIPS } from '@/constants/cityCategories'
import {
  buildCityCanonicalUrl,
  buildCityPageMetadata,
  cityOriginForSlug,
} from '@/lib/seo/cityPageMetadata'

const base = { title: 'T', description: 'D' }

describe('SEO-1B cityPageMetadata — all 81 provinces', () => {
  it('has 81 provinces to cover', () => {
    expect(TURKISH_PROVINCES.length).toBe(81)
  })

  for (const province of TURKISH_PROVINCES) {
    it(`${province.slug}: hubs + every district self-canonical on its own subdomain`, () => {
      const origin = `https://${province.slug}.nahaber.com`
      expect(cityOriginForSlug(province.slug)).toBe(origin)

      for (const hub of ['ilceler', 'nobetci-eczaneler', 'is-ilanlari', 'etkinlik']) {
        const m = buildCityPageMetadata({ citySlug: province.slug, segments: [hub], ...base })
        expect(m?.alternates?.canonical).toBe(`${origin}/${hub}`)
      }

      const districts = getDistrictsForProvince(province.slug)
      expect(districts.length).toBeGreaterThan(0)
      for (const d of districts) {
        expect(buildCityCanonicalUrl(province.slug, ['ilceler', d.slug])).toBe(
          `${origin}/ilceler/${d.slug}`
        )
      }
    })
  }

  it('city category chips produce self canonicals', () => {
    for (const chip of CITY_CATEGORY_CHIPS) {
      if (!chip.categoryId) continue
      expect(buildCityCanonicalUrl('antalya', ['kategori', chip.id])).toBe(
        `https://antalya.nahaber.com/kategori/${chip.id}`
      )
    }
  })
})

describe('SEO-1B cityPageMetadata — complete metadata objects (no shallow-merge loss)', () => {
  const m = buildCityPageMetadata({
    citySlug: 'canakkale',
    segments: ['ilceler', 'biga'],
    title: 'Biga Haberleri — Çanakkale',
    description: 'Biga ilçesinden yerel haberler.',
  })!

  it('canonical, og:url and twitter agree', () => {
    const canonical = 'https://canakkale.nahaber.com/ilceler/biga'
    expect(m.alternates?.canonical).toBe(canonical)
    expect((m.openGraph as { url?: string }).url).toBe(canonical)
    expect(m.title).toBe('Biga Haberleri — Çanakkale')
    expect(m.description).toBe('Biga ilçesinden yerel haberler.')
  })

  it('does not emit the root tr-TR → www hreflang', () => {
    expect(m.alternates?.languages).toBeUndefined()
    expect(JSON.stringify(m.alternates)).not.toContain('"tr-TR"')
  })

  it('keeps RSS alternates', () => {
    const rss = (m.alternates?.types as Record<string, unknown[]>)['application/rss+xml']
    expect(rss).toHaveLength(3)
  })

  it('OpenGraph is complete (images, siteName, locale, type, title, description)', () => {
    const og = m.openGraph as Record<string, unknown>
    expect(og.type).toBe('website')
    expect(og.locale).toBe('tr_TR')
    expect(og.siteName).toBeTruthy()
    expect(og.title).toContain('Biga Haberleri — Çanakkale')
    expect(og.description).toBe('Biga ilçesinden yerel haberler.')
    const images = og.images as Array<{ url: string; width: number; height: number }>
    expect(images[0].url).toMatch(/\/brand\/og-default\.png$/)
    expect(images[0].width).toBe(1200)
    expect(images[0].height).toBe(630)
  })

  it('Twitter is complete', () => {
    const tw = m.twitter as Record<string, unknown>
    expect(tw.card).toBe('summary_large_image')
    expect(tw.site).toBe('@nahabercom')
    expect(tw.title).toContain('Biga Haberleri — Çanakkale')
    expect(tw.description).toBe('Biga ilçesinden yerel haberler.')
    expect((tw.images as string[])[0]).toMatch(/\/brand\/og-default\.png$/)
  })
})

describe('SEO-1B cityPageMetadata — guards', () => {
  it.each([
    [null],
    [undefined],
    [''],
    ['www'],
    ['Canakkale'],
    ['canakkale.evil'],
    ['not-a-province'],
    ['canakale'], // fuzzy/legacy alias → not a canonical host
    ['biga'], // district slug normalizes to a province → rejected
  ])('rejects city slug %s', (slug) => {
    expect(cityOriginForSlug(slug as string | null | undefined)).toBeNull()
    expect(buildCityPageMetadata({ citySlug: slug, segments: ['ilceler'], ...base })).toBeNull()
  })

  it.each([
    [['kategori', 'SPOR']],
    [['kategori', 'spor?x=1']],
    [['kategori', 'spor/']],
    [['kategori', '']],
    [['kategori', '../admin']],
    [['ilceler', 'biga ']],
    [['ilceler', 'bi%67a']],
    [['kategori', '-spor']],
  ])('rejects unsafe segments %j', (segments) => {
    expect(buildCityCanonicalUrl('canakkale', segments)).toBeNull()
  })

  it('no trailing slash, no query string for valid input', () => {
    const url = buildCityCanonicalUrl('izmir', ['ilceler', 'karsiyaka'])
    expect(url).toBe('https://izmir.nahaber.com/ilceler/karsiyaka')
    expect(url!.endsWith('/')).toBe(false)
    expect(url).not.toContain('?')
  })
})
