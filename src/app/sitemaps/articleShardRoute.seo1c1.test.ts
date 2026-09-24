/**
 * SEO-1C.1 — /sitemaps/[file] route + /sitemap.xml index integration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { XMLValidator } from 'fast-xml-parser'

const state = vi.hoisted(() => ({
  host: 'www.nahaber.com',
  month: null as null | { month: string; entries: [string, number][] },
  error: null as null | Error,
  indexItems: [] as Array<{ loc: string; lastmod?: string }>,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', state.host]]),
}))

vi.mock('@/lib/sitemap/articleSitemap', () => ({
  getArticleMonth: vi.fn(async () => {
    if (state.error) throw state.error
    return state.month
  }),
  getArticleSitemapIndexItems: vi.fn(async () => state.indexItems),
}))

vi.mock('@/lib/sitemap/mainSitemap', () => ({ getSitemapPageCount: async () => 1 }))

import { GET } from '@/app/sitemaps/[file]/route'
import { buildSitemapIndexXmlAsync } from '@/lib/sitemap/sitemapIndex'

const call = (file: string) => GET(new Request(`https://www.nahaber.com/sitemaps/${file}`), { params: Promise.resolve({ file }) })

describe('SEO-1C.1 /sitemaps/[file]', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 24, 12)))
    state.host = 'www.nahaber.com'
    state.error = null
    state.month = { month: '2026-09', entries: [['haber-a', 1_789_000_000], ['haber-b', 1_788_000_000]] }
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('serves a valid urlset of www /haber/ URLs with 1h cache for the current month', async () => {
    const res = await call('articles-2026-09.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')
    expect(res.headers.get('cache-control')).toContain('s-maxage=3600')
    const xml = await res.text()
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain('<loc>https://www.nahaber.com/haber/haber-a</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(2)
  })

  it('closed months get 24h cache', async () => {
    state.month = { month: '2026-08', entries: [['eski', 1_786_000_000]] }
    const res = await call('articles-2026-08.xml')
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  it('404 on city hosts (article canonicals live on www)', async () => {
    state.host = 'canakkale.nahaber.com'
    expect((await call('articles-2026-09.xml')).status).toBe(404)
  })

  it('404 on invalid names, future months, empty months and missing parts', async () => {
    for (const f of ['articles-2026-9.xml', 'articles-2026-09-1.xml', 'foo.xml', 'articles-2026-10.xml']) {
      expect((await call(f)).status).toBe(404)
    }
    expect((await call('articles-2026-09-2.xml')).status).toBe(404)
    state.month = { month: '2026-09', entries: [] }
    expect((await call('articles-2026-09.xml')).status).toBe(404)
  })

  it('503 + no-store when a source fails (never an empty cached shard)', async () => {
    state.error = new Error('firestore down')
    const res = await call('articles-2026-09.xml')
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('SEO-1C.1 /sitemap.xml index integration', () => {
  it('keeps existing children and appends article shards with lastmod', async () => {
    state.indexItems = [
      { loc: 'https://www.nahaber.com/sitemaps/articles-2026-09.xml', lastmod: '2026-09-24T10:00:00.000Z' },
      { loc: 'https://www.nahaber.com/sitemaps/articles-2026-08.xml' },
    ]
    const xml = await buildSitemapIndexXmlAsync('https://www.nahaber.com')
    expect(XMLValidator.validate(xml)).toBe(true)
    for (const child of ['news-sitemap.xml', 'video-sitemap.xml', 'images-sitemap.xml', 'sitemap-cities.xml', 'sitemap/0.xml']) {
      expect(xml).toContain(`https://www.nahaber.com/${child}`)
    }
    expect(xml).toContain(
      '<loc>https://www.nahaber.com/sitemaps/articles-2026-09.xml</loc>\n    <lastmod>2026-09-24T10:00:00.000Z</lastmod>'
    )
    expect(xml).toContain('<loc>https://www.nahaber.com/sitemaps/articles-2026-08.xml</loc>\n  </sitemap>')
  })

  it('index still renders if article shard discovery throws', async () => {
    const mod = await import('@/lib/sitemap/articleSitemap')
    vi.mocked(mod.getArticleSitemapIndexItems).mockRejectedValueOnce(new Error('down'))
    const xml = await buildSitemapIndexXmlAsync('https://www.nahaber.com')
    expect(xml).toContain('https://www.nahaber.com/news-sitemap.xml')
    expect(xml).not.toContain('/sitemaps/articles-')
  })
})
