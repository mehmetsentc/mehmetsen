/**
 * SEO-2B — Google News sitemap: eligibility, window, dates, XML, scale, loader.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

vi.mock('@/db', () => ({ getDb: vi.fn(), hasDatabaseUrl: vi.fn(() => false) }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const fsState = vi.hoisted(() => ({
  calls: [] as Array<Array<[string, unknown[]]>>,
  pages: [] as Array<Array<{ id: string; data: Record<string, unknown> }>>,
  fail: false,
}))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => {
      const ops: Array<[string, unknown[]]> = []
      fsState.calls.push(ops)
      const q: Record<string, unknown> = {}
      for (const n of ['where', 'orderBy', 'select', 'limit', 'startAfter']) {
        q[n] = (...a: unknown[]) => {
          ops.push([n, a])
          return q
        }
      }
      q.get = async () => {
        if (fsState.fail) throw new Error('firestore down')
        const page = fsState.pages.shift() ?? []
        return { empty: page.length === 0, docs: page.map((d) => ({ id: d.id, data: () => d.data })) }
      }
      return q
    },
  }),
}))

const pgState = vi.hoisted(() => ({ rows: [] as unknown[], keys: [] as string[], lastOpts: undefined as unknown, fail: false }))
vi.mock('@/lib/canonical/canonicalEligibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/canonical/canonicalEligibility')>()
  return {
    ...actual,
    getCanonicalPublishedNewsForSitemap: vi.fn(async (opts: unknown) => {
      pgState.lastOpts = opts
      if (pgState.fail) throw new Error('pg down')
      return pgState.rows
    }),
    getCanonicalPublishedIdentityKeys: vi.fn(async () => pgState.keys),
    getCanonicalPublishedMonthKeysUtc: vi.fn(async () => []),
  }
})

import { canonicalRowToPost, type CanonicalNewsRow } from '@/lib/canonical/canonicalEligibility'
import type { FirestoreSitemapCandidate } from '@/lib/sitemap/articleSitemapEntries'
import {
  buildNewsSitemapEntries,
  entriesInWindow,
  NEWS_SITEMAP_MAX_ENTRIES,
  NEWS_SITEMAP_RAW_CAP,
  NEWS_SITEMAP_WINDOW_MS,
  NewsSitemapCapExceededError,
  newsPartCount,
  newsPublicationName,
  newsSitemapIndexXml,
  newsSlice,
  newsUrlsetXml,
  parseNewsChildFile,
  type NewsSitemapEntry,
  type PgNewsCandidate,
} from '@/lib/sitemap/newsSitemap'
import { loadFirestoreNewsWindow, loadNewsSitemapEntries } from '@/lib/sitemap/newsSitemapLoader'

const BASE = 'https://www.nahaber.com'
const NOW = Date.UTC(2026, 8, 25, 12)
const RECENT = NOW - 3 * 3600_000

function fsDoc(id: string, over: Record<string, unknown> = {}): FirestoreSitemapCandidate {
  return {
    id,
    data: {
      title: `Başlık ${id}`,
      slug: `haber-${id}`,
      status: 'published',
      publishedAt: RECENT,
      updatedAt: RECENT + 60_000,
      authorId: 'editor_1',
      ...over,
    },
  }
}

function pgRow(id: string, over: Partial<CanonicalNewsRow> = {}): CanonicalNewsRow {
  return {
    id,
    legacyFirestoreId: null,
    slug: `pg-${id}`,
    title: `PG başlık ${id}`,
    summary: null,
    description: 'd',
    content: 'c',
    htmlContent: null,
    status: 'published',
    categoryId: 'gundem',
    citySlug: null,
    cityName: null,
    districtSlug: null,
    districtName: null,
    authorId: 'editor_1',
    authorDisplayName: 'Editör',
    source: null,
    sourceUrl: null,
    publishedAt: new Date(RECENT),
    updatedAt: new Date(RECENT + 120_000),
    createdAt: new Date(RECENT),
    ...over,
  } as unknown as CanonicalNewsRow
}

const pgCand = (row: CanonicalNewsRow): PgNewsCandidate => ({
  post: canonicalRowToPost(row),
  publishedAt: row.publishedAt,
  updatedAt: row.updatedAt,
  title: row.title,
})

function build(o: { fs?: FirestoreSitemapCandidate[]; pg?: CanonicalNewsRow[]; keys?: string[]; now?: number }) {
  return buildNewsSitemapEntries({
    nowMs: o.now ?? NOW,
    firestore: o.fs ?? [],
    pg: (o.pg ?? []).map(pgCand),
    pgIdentityKeys: o.keys ?? [],
  })
}
const slugs = (e: NewsSitemapEntry[]) => e.map((x) => x.slug)

describe('SEO-2B sources + classes', () => {
  it('Firestore article included', () => expect(slugs(build({ fs: [fsDoc('a')] }))).toEqual(['haber-a']))
  it('PG article included', () => expect(slugs(build({ pg: [pgRow('p')] }))).toEqual(['pg-p']))
  it('LEGACY_ALLOWED included (approved)', () =>
    expect(slugs(build({ fs: [fsDoc('l', { publicationAuthority: undefined })] }))).toEqual(['haber-l']))
  it('CANONICAL (HUMAN_EDITOR) included', () =>
    expect(slugs(build({ fs: [fsDoc('c', { publicationAuthority: 'HUMAN_EDITOR' })] }))).toEqual(['haber-c']))
  it('SYSTEM_ALERT included', () =>
    expect(slugs(build({ fs: [fsDoc('s', { publicationAuthority: 'SYSTEM_ALERT' })] }))).toEqual(['haber-s']))

  it('LEGACY_QUARANTINED excluded', () => {
    const e = build({
      fs: [
        fsDoc('q1', { aiAutoPublished: true }),
        fsDoc('q2', { needsReview: true }),
        fsDoc('q3', { authorId: 'crawler_bot' }),
      ],
    })
    expect(e).toEqual([])
  })

  it.each(['draft', 'pending', 'unpublished', 'deleted', 'archived', 'banned', 'private'])(
    'NOT_PUBLIC status %s excluded',
    (status) => expect(build({ fs: [fsDoc('x', { status })] })).toEqual([])
  )

  it('forced noindex excluded', () => {
    expect(
      build({
        fs: [
          fsDoc('n1', { seoNoindex: true }),
          fsDoc('n2', { publisherType: 'INTERNAL_TEST' }),
          fsDoc('n3', { visibility: 'private' }),
        ],
      })
    ).toEqual([])
  })

  it('taslak slug, id-only, missing slug, canonical-other excluded', () => {
    expect(
      build({
        fs: [
          fsDoc('t1', { slug: 'taslak-abc123' }),
          fsDoc('t2', { slug: 'ai-taslak-x' }),
          fsDoc('idonly', { slug: 'idonly' }),
          fsDoc('noslug', { slug: undefined }),
          fsDoc('bad', { slug: 'a/b' }),
        ],
        pg: [pgRow('same', { slug: 'same' })],
      })
    ).toEqual([])
  })

  it('missing headline excluded (no "Başlıksız" placeholder)', () => {
    expect(build({ fs: [fsDoc('nt', { title: '   ' })] })).toEqual([])
  })
})

describe('SEO-2B 48h window + dates', () => {
  it('exact 48h boundary included; older excluded; future excluded', () => {
    const e = build({
      fs: [
        fsDoc('edge', { publishedAt: NOW - NEWS_SITEMAP_WINDOW_MS }),
        fsDoc('old', { publishedAt: NOW - NEWS_SITEMAP_WINDOW_MS - 1 }),
        fsDoc('now', { publishedAt: NOW }),
        fsDoc('future', { publishedAt: NOW + 1 }),
      ],
    })
    expect(slugs(e).sort()).toEqual(['haber-edge', 'haber-now'])
  })

  it('missing / invalid publishedAt excluded (no createdAt or now() fallback)', () => {
    expect(
      build({
        fs: [
          fsDoc('m', { publishedAt: undefined, createdAt: RECENT }),
          fsDoc('i', { publishedAt: 'not-a-date' }),
          fsDoc('z', { publishedAt: 0 }),
        ],
      })
    ).toEqual([])
  })

  it('seconds and milliseconds timestamps handled', () => {
    const sec = Math.floor(RECENT / 1000)
    const e = build({ fs: [fsDoc('sec', { publishedAt: sec }), fsDoc('ms', { publishedAt: RECENT - 1000 })] })
    expect(e.find((x) => x.slug === 'haber-sec')?.publishedMs).toBe(sec * 1000)
    expect(e.find((x) => x.slug === 'haber-ms')?.publishedMs).toBe(RECENT - 1000)
  })

  it('publication_date == publishedAt; updatedAt never used', () => {
    const e = build({ fs: [fsDoc('d', { publishedAt: RECENT, updatedAt: NOW - 1000 })] })
    const xml = newsUrlsetXml(BASE, e)
    expect(xml).toContain(`<news:publication_date>${new Date(RECENT).toISOString()}</news:publication_date>`)
    expect(xml).not.toContain(new Date(NOW - 1000).toISOString())
    expect(xml).not.toContain('<lastmod>')
  })

  it('entries that age out after caching are dropped at serve time', () => {
    const e = build({ fs: [fsDoc('a', { publishedAt: NOW - NEWS_SITEMAP_WINDOW_MS + 1000 })] })
    expect(entriesInWindow(e, NOW)).toHaveLength(1)
    expect(entriesInWindow(e, NOW + 2000)).toHaveLength(0)
  })
})

describe('SEO-2B dedupe + URLs + XML', () => {
  it('PG + Firestore same identity → one canonical URL (PG wins)', () => {
    const e = build({
      pg: [pgRow('p1', { slug: 'ortak', legacyFirestoreId: 'fs1', title: 'PG başlığı' })],
      fs: [fsDoc('fs1', { slug: 'ortak', title: 'FS başlığı' }), fsDoc('fs2', { slug: 'ortak' })],
      keys: ['p1', 'ortak', 'fs1'],
    })
    expect(e).toHaveLength(1)
    expect(e[0]!.title).toBe('PG başlığı')
  })

  it('www /haber/ URLs only, even for city articles; never /post/ or /haber/{id}', () => {
    const e = build({ fs: [fsDoc('c', { citySlug: 'canakkale' })], pg: [pgRow('p', { citySlug: 'antalya' })] })
    const xml = newsUrlsetXml(BASE, e)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toHaveLength(2)
    for (const l of locs) expect(l).toMatch(/^https:\/\/www\.nahaber\.com\/haber\/[^/]+$/)
    expect(xml).not.toMatch(/canakkale\.nahaber|antalya\.nahaber|\/post\//)
  })

  it('title == headline, escaped; name NaHaber; language tr; valid XML with required tags', () => {
    const e = build({ fs: [fsDoc('x', { title: 'A & B <C> "D" başlık', seoTitle: 'SEO başlığı', socialHeadline: 'Sosyal' })] })
    const xml = newsUrlsetXml(BASE, e)
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain('<news:title>A &amp; B &lt;C&gt; &quot;D&quot; başlık</news:title>')
    expect(xml).not.toContain('SEO başlığı')
    expect(xml).not.toContain('Sosyal')
    expect(xml).not.toContain('news:keywords')
    const u = new XMLParser().parse(xml).urlset.url
    expect(u['news:news']['news:publication']['news:name']).toBe('NaHaber')
    expect(u['news:news']['news:publication']['news:language']).toBe('tr')
    expect(u['news:news']['news:publication_date']).toBe(new Date(RECENT).toISOString())
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
  })

  it('publication name comes from the site identity env and is escaped', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'NaHaber')
    expect(newsPublicationName()).toBe('NaHaber')
    expect(newsUrlsetXml(BASE, build({ fs: [fsDoc('a')] }), 'A&B')).toContain('<news:name>A&amp;B</news:name>')
    vi.unstubAllEnvs()
  })

  it('newest publishedAt first', () => {
    const e = build({ fs: [fsDoc('o', { publishedAt: RECENT - 5000 }), fsDoc('n', { publishedAt: RECENT + 5000 })] })
    expect(slugs(e)).toEqual(['haber-n', 'haber-o'])
  })
})

describe('SEO-2B scale', () => {
  const many = (n: number): NewsSitemapEntry[] =>
    Array.from({ length: n }, (_, i) => ({ slug: `s${i}`, publishedMs: RECENT - i, title: `t${i}` }))

  it('999 / 1000 → one urlset; 1001 → two parts ≤ 1000', () => {
    expect(NEWS_SITEMAP_MAX_ENTRIES).toBe(1000)
    expect(newsPartCount(999)).toBe(1)
    expect(newsPartCount(1000)).toBe(1)
    expect(newsPartCount(1001)).toBe(2)
    const e = many(1001)
    expect(newsSlice(e, 1)).toHaveLength(1000)
    expect(newsSlice(e, 2)).toHaveLength(1)
    expect(newsSlice(e, 3)).toHaveLength(0)
    expect(() => newsUrlsetXml(BASE, e)).toThrow()
    const idx = newsSitemapIndexXml(BASE, 2)
    expect(XMLValidator.validate(idx)).toBe(true)
    expect(idx).toContain('<loc>https://www.nahaber.com/news-sitemaps/news-1.xml</loc>')
    expect(idx).toContain('<loc>https://www.nahaber.com/news-sitemaps/news-2.xml</loc>')
    expect(parseNewsChildFile('news-1.xml')).toBe(1)
    expect(parseNewsChildFile('news-0.xml')).toBeNull()
    expect(parseNewsChildFile('news-x.xml')).toBeNull()
    expect(parseNewsChildFile('../news-1.xml')).toBeNull()
  })
})

describe('SEO-2B loader (bounded, fail-closed)', () => {
  beforeEach(() => {
    fsState.calls = []
    fsState.pages = []
    fsState.fail = false
    pgState.rows = []
    pgState.keys = []
    pgState.fail = false
  })

  it('Firestore query bounded to [now-48h, now] with projection and paging', async () => {
    fsState.pages = [Array.from({ length: 1000 }, (_, i) => fsDoc(`p${i}`)), [fsDoc('last')]]
    const docs = await loadFirestoreNewsWindow(NOW)
    expect(docs).toHaveLength(1001)
    const ops = fsState.calls[0]!
    expect(ops).toContainEqual(['where', ['status', '==', 'published']])
    expect(ops).toContainEqual(['where', ['publishedAt', '>=', NOW - NEWS_SITEMAP_WINDOW_MS]])
    expect(ops).toContainEqual(['where', ['publishedAt', '<=', NOW]])
    expect(ops).toContainEqual(['orderBy', ['publishedAt', 'desc']])
    expect(ops.find(([n]) => n === 'select')?.[1]).toEqual(expect.arrayContaining(['slug', 'title', 'publishedAt', 'status']))
    expect(fsState.calls[1]!.some(([n]) => n === 'startAfter')).toBe(true)
  })

  it('raw cap exceeded throws (no partial sitemap)', async () => {
    fsState.pages = Array.from({ length: 6 }, (_, p) => Array.from({ length: 1000 }, (_, i) => fsDoc(`c${p}-${i}`)))
    await expect(loadFirestoreNewsWindow(NOW)).rejects.toBeInstanceOf(NewsSitemapCapExceededError)
    expect(NEWS_SITEMAP_RAW_CAP).toBe(5000)
  })

  it('PG raw cap exceeded throws', async () => {
    fsState.pages = [[]]
    pgState.rows = Array.from({ length: NEWS_SITEMAP_RAW_CAP + 1 }, (_, i) => pgRow(`r${i}`))
    await expect(loadNewsSitemapEntries(NOW)).rejects.toBeInstanceOf(NewsSitemapCapExceededError)
  })

  it('merges sources, PG window matches, errors propagate', async () => {
    fsState.pages = [[fsDoc('f1'), fsDoc('dup', { slug: 'pg-p1' })]]
    pgState.rows = [pgRow('p1')]
    pgState.keys = ['p1', 'pg-p1']
    const e = await loadNewsSitemapEntries(NOW)
    expect(slugs(e).sort()).toEqual(['haber-f1', 'pg-p1'])
    expect(pgState.lastOpts).toMatchObject({
      from: new Date(NOW - NEWS_SITEMAP_WINDOW_MS),
      to: new Date(NOW + 1),
      throwOnError: true,
      limit: NEWS_SITEMAP_RAW_CAP + 1,
    })
    fsState.pages = [[]]
    pgState.fail = true
    await expect(loadNewsSitemapEntries(NOW)).rejects.toThrow('pg down')
    pgState.fail = false
    fsState.fail = true
    await expect(loadNewsSitemapEntries(NOW)).rejects.toThrow('firestore down')
  })
})
