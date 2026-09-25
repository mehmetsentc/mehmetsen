/**
 * SEO-1C.3 — city /sitemap.xml lists only self-canonical city-owned URLs:
 * landing pages + all authoritative district pages + (unchanged) categories.
 * No soft redirect / form / www-canonical pages, no /haber/* city copies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { XMLValidator } from 'fast-xml-parser'

const state = vi.hoisted(() => ({ host: 'canakkale.nahaber.com', indexCalls: 0 }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))
vi.mock('@/lib/sitemap/sitemapIndex', () => ({
  buildSitemapIndexXmlAsync: vi.fn(async (base: string) => {
    state.indexCalls++
    return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/sitemaps/articles-2026-09.xml</loc></sitemap></sitemapindex>`
  }),
}))
const pgSpy = vi.hoisted(() => vi.fn(async () => [{ id: 'x', slug: 'haber-slug', publishedAt: new Date(), updatedAt: null }]))
vi.mock('@/lib/canonical/canonicalEligibility', () => ({ getCanonicalPublishedNewsForSitemap: pgSpy }))

import { GET } from '@/app/sitemap.xml/route'
import { getDistrictsForProvince } from '@/constants/cities'

const CATEGORIES = [
  'gundem', 'siyaset', 'ekonomi', 'yasam', 'egitim', 'kultur', 'turizm', 'asayis', 'spor',
  'gastronomi', 'son-dakika', 'saglik', 'bilim', 'teknoloji', 'magazin', 'otomobil', 'meteoroloji',
]
const LANDINGS = ['', '/etkinlik', '/ilceler', '/is-ilanlari', '/nobetci-eczaneler']
const FORBIDDEN = ['/spor', '/is-ilanlari/eleman-ariyorum', '/is-ilanlari/is-ariyorum', '/editoryal-ilkeler']

async function citySitemap(city: string) {
  state.host = `${city}.nahaber.com`
  const res = await GET()
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  return { res, xml, locs }
}

describe.each([
  ['canakkale', 12],
  ['antalya', 19],
])('SEO-1C.3 %s city sitemap', (city, expectedDistricts) => {
  const base = `https://${city}.nahaber.com`
  beforeEach(() => pgSpy.mockClear())

  it('valid XML urlset, no duplicates, only this city host', async () => {
    const { res, xml, locs } = await citySitemap(city)
    expect(res.status).toBe(200)
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain('<urlset')
    expect(new Set(locs).size).toBe(locs.length)
    for (const l of locs) expect(l.startsWith(base)).toBe(true)
  })

  it('includes every authoritative district page (getDistrictsForProvince)', async () => {
    const districts = getDistrictsForProvince(city)
    expect(districts).toHaveLength(expectedDistricts)
    const { locs } = await citySitemap(city)
    const districtLocs = locs.filter((l) => l.startsWith(`${base}/ilceler/`))
    expect(districtLocs.sort()).toEqual(districts.map((d) => `${base}/ilceler/${d.slug}`).sort())
  })

  it('invalid static URLs and /haber/* copies are absent; no fake lastmod', async () => {
    const { locs, xml } = await citySitemap(city)
    for (const p of FORBIDDEN) expect(locs).not.toContain(`${base}${p}`)
    expect(locs.some((l) => l.includes('/haber/'))).toBe(false)
    expect(pgSpy).not.toHaveBeenCalled()
    expect(xml).not.toContain('<lastmod>')
  })

  it('existing landing pages and category behaviour unchanged', async () => {
    const { locs } = await citySitemap(city)
    for (const p of LANDINGS) expect(locs).toContain(`${base}${p || '/'}`)
    const cats = locs.filter((l) => l.startsWith(`${base}/kategori/`))
    expect(cats).toEqual(CATEGORIES.map((c) => `${base}/kategori/${c}`))
    expect(locs).toHaveLength(LANDINGS.length + expectedDistricts + CATEGORIES.length)
  })
})

describe('SEO-1C.3 www branch unchanged', () => {
  it('www host still serves the sitemap index (monthly article shards)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
    state.host = 'www.nahaber.com'
    state.indexCalls = 0
    const res = await GET()
    const xml = await res.text()
    expect(state.indexCalls).toBe(1)
    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('https://www.nahaber.com/sitemaps/articles-2026-09.xml')
    expect(res.headers.get('cache-control')).toBe('s-maxage=172800, stale-while-revalidate=7200')
    vi.unstubAllEnvs()
  })
})
