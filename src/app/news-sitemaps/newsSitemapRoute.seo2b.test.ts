/**
 * SEO-2B — /news-sitemap.xml and /news-sitemaps/[file] route behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { XMLValidator } from 'fast-xml-parser'

const state = vi.hoisted(() => ({
  host: 'www.nahaber.com',
  entries: [] as Array<{ slug: string; publishedMs: number; title: string }>,
  error: null as null | Error,
}))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))
vi.mock('@/lib/sitemap/newsSitemapLoader', () => ({
  getNewsSitemapEntries: vi.fn(async () => {
    if (state.error) throw state.error
    return state.entries
  }),
}))

import { GET as ROOT } from '@/app/news-sitemap.xml/route'
import { GET as CHILD } from '@/app/news-sitemaps/[file]/route'

const NOW = Date.UTC(2026, 8, 25, 12)
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ slug: `haber-${i}`, publishedMs: NOW - 60_000 - i, title: `Başlık ${i}` }))
const child = (file: string) => CHILD(new Request(`https://www.nahaber.com/news-sitemaps/${file}`), { params: Promise.resolve({ file }) })

describe('SEO-2B news sitemap routes', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    state.host = 'www.nahaber.com'
    state.error = null
    state.entries = many(3)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('www ≤1000 → news urlset, 300/300 cache, valid XML', async () => {
    const res = await ROOT()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=300')
    const xml = await res.text()
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain('<urlset')
    expect(xml.match(/<news:news>/g)).toHaveLength(3)
    expect(xml).toContain('<loc>https://www.nahaber.com/haber/haber-0</loc>')
  })

  it('1000 → one urlset; 1001 → sitemapindex with two children', async () => {
    state.entries = many(1000)
    let xml = await (await ROOT()).text()
    expect(xml).toContain('<urlset')
    expect(xml.match(/<news:news>/g)).toHaveLength(1000)

    state.entries = many(1001)
    xml = await (await ROOT()).text()
    expect(xml).toContain('<sitemapindex')
    expect(xml.match(/<sitemap>/g)).toHaveLength(2)
    const c1 = await child('news-1.xml')
    const c2 = await child('news-2.xml')
    expect(c1.status).toBe(200)
    expect((await c1.text()).match(/<news:news>/g)).toHaveLength(1000)
    expect((await c2.text()).match(/<news:news>/g)).toHaveLength(1)
    expect((await child('news-3.xml')).status).toBe(404)
  })

  it('children are 404 when not advertised (≤1000), invalid, or on city hosts', async () => {
    expect((await child('news-1.xml')).status).toBe(404)
    state.entries = many(1001)
    expect((await child('news-0.xml')).status).toBe(404)
    expect((await child('foo.xml')).status).toBe(404)
    state.host = 'canakkale.nahaber.com'
    expect((await child('news-1.xml')).status).toBe(404)
  })

  it('city host root → valid empty news urlset (no subdomain article URLs)', async () => {
    state.host = 'canakkale.nahaber.com'
    const res = await ROOT()
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).not.toContain('<url>')
    expect(xml).not.toContain('canakkale.nahaber.com')
  })

  it('genuinely empty window → 200 empty urlset', async () => {
    state.entries = []
    const res = await ROOT()
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('<url>')
  })

  it('source failure / cap exceeded → 503 + no-store, never an empty 200', async () => {
    state.error = new Error('news sitemap firestore rows 5001 exceed cap 5000')
    const res = await ROOT()
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    state.entries = many(1001)
    const c = await child('news-1.xml')
    expect(c.status).toBe(503)
    expect(c.headers.get('cache-control')).toBe('no-store')
  })

  it('entries older than 48h at serve time are dropped', async () => {
    state.entries = [{ slug: 'eski', publishedMs: NOW - 48 * 3600_000 - 1, title: 'x' }, ...many(1)]
    const xml = await (await ROOT()).text()
    expect(xml).not.toContain('/haber/eski')
    expect(xml.match(/<news:news>/g)).toHaveLength(1)
  })
})
