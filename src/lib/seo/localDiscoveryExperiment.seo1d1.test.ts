/**
 * SEO-1D.1 — Çanakkale crawl-discovery experiment (Phase 1, links only).
 *
 * Proves the www → canakkale.nahaber.com links exist as plain server-rendered
 * hrefs, target the exact experiment URLs, and that Antalya (control) and every
 * other province receive nothing. Canonical/metadata of /yerel/{city} unchanged.
 */
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/local/LocalNewsClient', () => ({
  LocalNewsClient: () => createElement('div', { 'data-testid': 'local-news-client' }),
}))
vi.mock('@/services/newsService.server', () => ({
  getBreakingSliderItems: async () => [],
}))

import {
  DISCOVERY_EXPERIMENT_CITY_ORIGIN,
  getCityHostDiscoveryLink,
  getDistrictDiscoveryLink,
  getYerelCityBridgeLinks,
} from './localDiscoveryExperiment'
import { buildCityCanonicalUrl } from './cityPageMetadata'
import { getSiteUrl } from '@/lib/seo'
import { getDistrictsForProvince } from '@/constants/cities'
import { ArticleRelatedLinks } from '@/components/news/ArticleRelatedLinks'
import type { Post } from '@/types/post'

// Vitest compiles TSX with the classic runtime; expose React for component JSX.
;(globalThis as { React?: typeof React }).React = React

const TEST_URLS = [
  'https://canakkale.nahaber.com/',
  'https://canakkale.nahaber.com/ilceler',
  'https://canakkale.nahaber.com/ilceler/biga',
  'https://canakkale.nahaber.com/ilceler/gelibolu',
  'https://canakkale.nahaber.com/ilceler/bozcaada',
]

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1])
}

function anchorTags(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0])
}

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'p1',
    slug: 'ornek-haber',
    title: 'Örnek haber',
    categoryId: 'gundem',
    tags: [],
    ...overrides,
  } as unknown as Post
}

function renderRelated(post: Post): string {
  return renderToStaticMarkup(createElement(ArticleRelatedLinks, { post }))
}

describe('SEO-1D.1 helpers', () => {
  it('bridge links are exactly the five Çanakkale test URLs', () => {
    expect(getYerelCityBridgeLinks('canakkale').map((l) => l.href)).toEqual(TEST_URLS)
  })

  it('test URLs match the city sitemap/canonical URL builder', () => {
    expect(TEST_URLS[0]).toBe(`${buildCityCanonicalUrl('canakkale', [])}/`)
    expect(TEST_URLS[1]).toBe(buildCityCanonicalUrl('canakkale', ['ilceler']))
    for (const slug of ['biga', 'gelibolu', 'bozcaada']) {
      expect(TEST_URLS).toContain(buildCityCanonicalUrl('canakkale', ['ilceler', slug]))
      expect(getDistrictsForProvince('canakkale').some((d) => d.slug === slug)).toBe(true)
    }
  })

  it('Antalya control and other provinces get no experiment links', () => {
    for (const city of ['antalya', 'istanbul', 'izmir', '', null, undefined]) {
      expect(getYerelCityBridgeLinks(city)).toEqual([])
      expect(getCityHostDiscoveryLink(city)).toBeNull()
    }
    expect(getDistrictDiscoveryLink('antalya', 'manavgat')).toBeNull()
    expect(getDistrictDiscoveryLink('antalya', 'alanya')).toBeNull()
    expect(getDistrictDiscoveryLink('antalya', 'muratpasa')).toBeNull()
  })

  it('district link requires structured Çanakkale city + test district', () => {
    expect(getDistrictDiscoveryLink('canakkale', 'biga')?.href).toBe(
      'https://canakkale.nahaber.com/ilceler/biga'
    )
    expect(getDistrictDiscoveryLink('canakkale', ' Gelibolu ')?.href).toBe(
      'https://canakkale.nahaber.com/ilceler/gelibolu'
    )
    expect(getDistrictDiscoveryLink('canakkale', 'bozcaada')?.label).toBe('Bozcaada Haberleri')
    // Non-test Çanakkale districts are out of scope for Phase 1.
    expect(getDistrictDiscoveryLink('canakkale', 'ezine')).toBeNull()
    expect(getDistrictDiscoveryLink('canakkale', null)).toBeNull()
    // A test district slug under another province never links to Çanakkale.
    expect(getDistrictDiscoveryLink('bursa', 'biga')).toBeNull()
    expect(getDistrictDiscoveryLink(null, 'biga')).toBeNull()
  })
})

describe('SEO-1D.1 article → city/district links (ArticleRelatedLinks SSR)', () => {
  it('Çanakkale + Biga article renders plain crawlable hrefs to city home and Biga', () => {
    const html = renderRelated(
      makePost({ citySlug: 'canakkale', city: 'Çanakkale', districtSlug: 'biga' } as Partial<Post>)
    )
    const h = hrefs(html)
    expect(h).toContain('https://canakkale.nahaber.com/ilceler/biga')
    expect(h).toContain('https://canakkale.nahaber.com/')
    // Existing www local link is preserved.
    expect(h).toContain('/yerel/canakkale')
    expect(html).toContain('Biga Haberleri')
    expect(html).toContain('Çanakkale Haberleri')
    for (const tag of anchorTags(html).filter((t) => t.includes(DISCOVERY_EXPERIMENT_CITY_ORIGIN))) {
      expect(tag).not.toMatch(/nofollow/)
      expect(tag).not.toMatch(/onclick/i)
      expect(tag).not.toMatch(/hidden|display:\s*none/)
    }
  })

  it('Gelibolu and Bozcaada articles link to their own district only', () => {
    for (const slug of ['gelibolu', 'bozcaada']) {
      const h = hrefs(renderRelated(makePost({ citySlug: 'canakkale', districtSlug: slug } as Partial<Post>)))
      expect(h).toContain(`https://canakkale.nahaber.com/ilceler/${slug}`)
      expect(h.filter((x) => x.includes('/ilceler/'))).toHaveLength(1)
    }
  })

  it('Çanakkale article without structured district gets only the city-host link', () => {
    const h = hrefs(renderRelated(makePost({ citySlug: 'canakkale', city: 'Çanakkale' } as Partial<Post>)))
    expect(h).toContain('https://canakkale.nahaber.com/')
    expect(h.some((x) => x.includes('/ilceler/'))).toBe(false)
  })

  it('Antalya control article receives no city-host or district link', () => {
    const html = renderRelated(
      makePost({ citySlug: 'antalya', city: 'Antalya', districtSlug: 'manavgat' } as Partial<Post>)
    )
    const h = hrefs(html)
    expect(h.some((x) => x.includes('nahaber.com') && x.startsWith('http'))).toBe(false)
    expect(h.some((x) => x.includes('/ilceler/'))).toBe(false)
    expect(h).toContain('/yerel/antalya')
  })

  it('article without city has no experiment links', () => {
    const h = hrefs(renderRelated(makePost({})))
    expect(h.some((x) => x.startsWith('https://'))).toBe(false)
  })
})

describe('SEO-1D.1 www /yerel/{city} bridge', () => {
  async function renderYerel(citySlug: string) {
    const mod = await import('@/app/(main)/yerel/[citySlug]/page')
    const params = Promise.resolve({ citySlug })
    const element = await mod.default({ params })
    const html = renderToStaticMarkup(element)
    const meta = await mod.generateMetadata({ params: Promise.resolve({ citySlug }) })
    return { html, meta }
  }

  it('/yerel/canakkale server HTML contains all five experiment hrefs', async () => {
    const { html } = await renderYerel('canakkale')
    const h = hrefs(html)
    for (const url of TEST_URLS) expect(h).toContain(url)
    for (const tag of anchorTags(html).filter((t) => t.includes(DISCOVERY_EXPERIMENT_CITY_ORIGIN))) {
      expect(tag).not.toMatch(/nofollow/)
    }
  })

  it('/yerel/antalya (control) gets no city-host links', async () => {
    const { html } = await renderYerel('antalya')
    expect(html).not.toContain('antalya.nahaber.com')
    expect(html).not.toContain('canakkale.nahaber.com')
    expect(hrefs(html).some((x) => x.startsWith('https://'))).toBe(false)
  })

  it('canonical / robots / title of /yerel/canakkale and /yerel/antalya are unchanged', async () => {
    const c = (await renderYerel('canakkale')).meta
    expect(c.alternates?.canonical).toBe(`${getSiteUrl()}/yerel/canakkale`)
    expect(c.robots).toEqual({ index: true, follow: true })
    expect(c.title).toBe('Çanakkale Haberleri')
    const a = (await renderYerel('antalya')).meta
    expect(a.alternates?.canonical).toBe(`${getSiteUrl()}/yerel/antalya`)
    expect(a.title).toBe('Antalya Haberleri')
  })
})
