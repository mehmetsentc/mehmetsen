/**
 * SEO-1C.1 — permanent monthly article sitemaps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { XMLValidator, XMLParser } from 'fast-xml-parser'

vi.mock('@/db', () => ({ getDb: vi.fn(), hasDatabaseUrl: vi.fn(() => false) }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const fsState = vi.hoisted(() => ({
  calls: [] as Array<{ ops: Array<[string, unknown[]]> }>,
  pages: [] as Array<Array<{ id: string; data: Record<string, unknown> }>>,
  discovery: [] as number[],
  fail: false,
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => {
      const ops: Array<[string, unknown[]]> = []
      const call = { ops }
      fsState.calls.push(call)
      const q: Record<string, unknown> = {}
      for (const name of ['where', 'orderBy', 'select', 'limit', 'startAfter']) {
        q[name] = (...args: unknown[]) => {
          ops.push([name, args])
          return q
        }
      }
      q.get = async () => {
        if (fsState.fail) throw new Error('firestore down')
        const isDiscovery = ops.some(([n, a]) => n === 'limit' && a[0] === 1)
        if (isDiscovery) {
          const upper = ops.find(([n, a]) => n === 'where' && a[1] === '<')?.[1][2] as number
          const hit = fsState.discovery.filter((v) => v < upper).sort((a, b) => b - a)[0]
          const docs = hit === undefined ? [] : [{ id: 'x', get: () => hit, data: () => ({ publishedAt: hit }) }]
          return { empty: docs.length === 0, docs }
        }
        const page = fsState.pages.shift() ?? []
        const docs = page.map((d) => ({ id: d.id, data: () => d.data, get: (k: string) => d.data[k] }))
        return { empty: docs.length === 0, docs }
      }
      return q
    },
  }),
}))

const pgState = vi.hoisted(() => ({
  rows: [] as unknown[],
  keys: [] as string[],
  months: [] as string[],
  lastOpts: undefined as unknown,
}))

vi.mock('@/lib/canonical/canonicalEligibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/canonical/canonicalEligibility')>()
  return {
    ...actual,
    getCanonicalPublishedNewsForSitemap: vi.fn(async (opts: unknown) => {
      pgState.lastOpts = opts
      return pgState.rows
    }),
    getCanonicalPublishedIdentityKeys: vi.fn(async () => pgState.keys),
    getCanonicalPublishedMonthKeysUtc: vi.fn(async () => pgState.months),
  }
})

import { canonicalRowToPost, type CanonicalNewsRow } from '@/lib/canonical/canonicalEligibility'
import { SITEMAP_CHUNK_LIMIT } from '@/lib/sitemap/seoSitemaps'
import {
  ARTICLE_SITEMAP_MAX_URLS,
  articleShardFileName,
  isInMonth,
  monthBoundsUtc,
  monthKeyFromMs,
  parseArticleShardFile,
  partCount,
  slicePart,
  toEpochMsStrict,
} from '@/lib/sitemap/articleSitemapPartition'
import {
  articleUrlsetXml,
  buildArticleMonth,
  summarizeArticleMonth,
  type FirestoreSitemapCandidate,
  type PgSitemapCandidate,
} from '@/lib/sitemap/articleSitemapEntries'
import {
  discoverArticleMonths,
  getArticleSitemapIndexItems,
  loadArticleMonth,
  loadFirestoreMonthDocs,
} from '@/lib/sitemap/articleSitemap'

const BASE = 'https://www.nahaber.com'
const MONTH = '2026-09'
const SEP_START = Date.UTC(2026, 8, 1)
const OCT_START = Date.UTC(2026, 9, 1)
const NOW = Date.UTC(2026, 8, 24, 12)
const MID = Date.UTC(2026, 8, 15, 10)

function fsDoc(id: string, over: Record<string, unknown> = {}): FirestoreSitemapCandidate {
  return {
    id,
    data: {
      title: `Haber ${id}`,
      slug: `haber-${id}`,
      status: 'published',
      publishedAt: MID,
      updatedAt: MID + 60_000,
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
    title: `PG ${id}`,
    summary: null,
    description: 'desc',
    content: 'content',
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
    publishedAt: new Date(MID),
    updatedAt: new Date(MID + 120_000),
    createdAt: new Date(MID),
    ...over,
  } as unknown as CanonicalNewsRow
}

function pgCand(row: CanonicalNewsRow): PgSitemapCandidate {
  return { post: canonicalRowToPost(row), publishedAt: row.publishedAt, updatedAt: row.updatedAt }
}

function build(opts: {
  fs?: FirestoreSitemapCandidate[]
  pg?: CanonicalNewsRow[]
  keys?: string[]
  month?: string
  now?: number
}) {
  return buildArticleMonth({
    month: opts.month ?? MONTH,
    nowMs: opts.now ?? NOW,
    firestore: opts.fs ?? [],
    pg: (opts.pg ?? []).map(pgCand),
    pgIdentityKeys: opts.keys ?? [],
  })
}

const slugs = (m: { entries: [string, number][] }) => m.entries.map((e) => e[0])

describe('SEO-1C.1 eligibility', () => {
  it('1. Firestore published/indexable article is included', () => {
    expect(slugs(build({ fs: [fsDoc('a')] }))).toEqual(['haber-a'])
  })

  it('2. PostgreSQL canonical published article is included', () => {
    expect(slugs(build({ pg: [pgRow('p1')] }))).toEqual(['pg-p1'])
  })

  it('3. Firestore + PG with the same canonical → one URL (PG wins)', () => {
    const row = pgRow('p1', { slug: 'ortak-haber', legacyFirestoreId: 'fs1' })
    const month = build({
      pg: [row],
      fs: [fsDoc('fs1', { slug: 'ortak-haber', updatedAt: MID + 999_000 })],
      keys: ['p1', 'ortak-haber', 'fs1'],
    })
    expect(slugs(month)).toEqual(['ortak-haber'])
    expect(month.entries[0]![1]).toBe(Math.floor((MID + 120_000) / 1000))
  })

  it('3b. Firestore doc whose id is a PG legacyFirestoreId is not emitted twice under another slug', () => {
    const month = build({
      pg: [pgRow('p1', { slug: 'pg-slug', legacyFirestoreId: 'fs1' })],
      fs: [fsDoc('fs1', { slug: 'eski-slug' })],
      keys: ['p1', 'pg-slug', 'fs1'],
    })
    expect(slugs(month)).toEqual(['pg-slug'])
  })

  it('4. LEGACY_ALLOWED (Firestore, no modern authority, clean signals) is included', () => {
    expect(slugs(build({ fs: [fsDoc('legacy', { publicationAuthority: undefined })] }))).toEqual(['haber-legacy'])
  })

  it('5. LEGACY_QUARANTINED is excluded (AI auto-published / needs review / automation actor)', () => {
    const month = build({
      fs: [
        fsDoc('q1', { aiAutoPublished: true }),
        fsDoc('q2', { needsReview: true }),
        fsDoc('q3', { needsAdminReview: true }),
        fsDoc('q4', { authorId: 'crawler_bot' }),
        fsDoc('q5', { publishedBy: 'ai_worker' }),
      ],
    })
    expect(month.entries).toEqual([])
  })

  it('6. draft is excluded', () => {
    expect(build({ fs: [fsDoc('d', { status: 'draft' })] }).entries).toEqual([])
  })

  it('7. deleted / unpublished / archived are excluded', () => {
    const month = build({
      fs: [
        fsDoc('x1', { status: 'deleted' }),
        fsDoc('x2', { status: 'unpublished' }),
        fsDoc('x3', { status: 'archived' }),
        fsDoc('x4', { status: 'pending' }),
      ],
      pg: [pgRow('x5', { status: 'archived' })],
    })
    // PG status is forced by canonicalPublishedWhere upstream; canonicalRowToPost maps it to published.
    expect(slugs(month)).toEqual(['pg-x5'])
    expect(month.entries.filter(([s]) => s.startsWith('haber-'))).toEqual([])
  })

  it('8. noindex signals are excluded (seoNoindex, INTERNAL_TEST, private) — Firestore and PG', () => {
    const month = build({
      fs: [
        fsDoc('n1', { seoNoindex: true }),
        fsDoc('n2', { publisherType: 'INTERNAL_TEST' }),
        fsDoc('n3', { visibility: 'private' }),
        fsDoc('n4', { title: '[TEST] deneme' }),
        fsDoc('test_n5'),
      ],
    })
    expect(month.entries).toEqual([])
  })

  it('9. invalid / id-only / draft-placeholder slugs are excluded', () => {
    const month = build({
      fs: [
        fsDoc('noslug', { slug: undefined }),
        fsDoc('idonly', { slug: 'idonly' }),
        fsDoc('t1', { slug: 'taslak-2beg6kbd' }),
        fsDoc('t2', { slug: 'ai-taslak-abc' }),
        fsDoc('bad1', { slug: 'a/b' }),
        fsDoc('bad2', { slug: 'a b' }),
        fsDoc('bad3', { slug: 'a?x=1' }),
      ],
      pg: [pgRow('same', { slug: 'same' })],
    })
    expect(month.entries).toEqual([])
  })

  it('10. city article URLs are never emitted; 11. canonical always www /haber/', () => {
    const month = build({
      fs: [fsDoc('c1', { citySlug: 'canakkale', city: 'Çanakkale' })],
      pg: [pgRow('c2', { citySlug: 'antalya' })],
    })
    const xml = articleUrlsetXml(BASE, month.entries)
    expect(xml).not.toMatch(/canakkale\.nahaber\.com|antalya\.nahaber\.com/)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toHaveLength(2)
    for (const loc of locs) expect(loc).toMatch(/^https:\/\/www\.nahaber\.com\/haber\/[^/]+$/)
  })
})

describe('SEO-1C.1 month partition (UTC)', () => {
  it('bounds are UTC calendar months', () => {
    expect(monthBoundsUtc(MONTH)).toEqual({ startMs: SEP_START, endMs: OCT_START })
    expect(monthBoundsUtc('2026-12').endMs).toBe(Date.UTC(2027, 0, 1))
    expect(monthKeyFromMs(SEP_START)).toBe('2026-09')
    expect(monthKeyFromMs(SEP_START - 1)).toBe('2026-08')
  })

  it('12. month start boundary is inclusive', () => {
    expect(isInMonth(SEP_START, MONTH)).toBe(true)
    expect(slugs(build({ fs: [fsDoc('s', { publishedAt: SEP_START })] }))).toEqual(['haber-s'])
  })

  it('13. month end boundary is exclusive', () => {
    expect(isInMonth(OCT_START, MONTH)).toBe(false)
    expect(isInMonth(OCT_START - 1, MONTH)).toBe(true)
    const month = build({
      now: OCT_START + 86_400_000,
      fs: [fsDoc('e1', { publishedAt: OCT_START - 1 }), fsDoc('e2', { publishedAt: OCT_START })],
    })
    expect(slugs(month)).toEqual(['haber-e1'])
  })

  it('14. adjacent-month article is excluded (each article in exactly one shard)', () => {
    const docs = [fsDoc('aug', { publishedAt: SEP_START - 1 }), fsDoc('sep', { publishedAt: SEP_START })]
    const now = OCT_START + 1
    const sep = build({ fs: docs, now })
    const aug = build({ fs: docs, now, month: '2026-08' })
    expect(slugs(sep)).toEqual(['haber-sep'])
    expect(slugs(aug)).toEqual(['haber-aug'])
  })

  it('future-dated and epoch-seconds-misstored publishedAt are excluded', () => {
    expect(build({ fs: [fsDoc('f', { publishedAt: NOW + 3_600_000 })] }).entries).toEqual([])
    // 1.758e9 is seconds → real date Sep 2025, not inside 2026-09
    expect(build({ fs: [fsDoc('s', { publishedAt: 1_758_000_000 })] }).entries).toEqual([])
    expect(build({ fs: [fsDoc('m', { publishedAt: undefined })] }).entries).toEqual([])
  })
})

describe('SEO-1C.1 lastmod', () => {
  it('15. updatedAt → lastmod', () => {
    const m = build({ fs: [fsDoc('u', { updatedAt: MID + 3_600_000 })] })
    expect(m.entries[0]![1]).toBe(Math.floor((MID + 3_600_000) / 1000))
  })

  it('16. publishedAt fallback when updatedAt missing / invalid / in the future (never now())', () => {
    const m = build({
      fs: [
        fsDoc('p1', { updatedAt: undefined, publishedAt: MID }),
        fsDoc('p2', { updatedAt: 'not-a-date', publishedAt: MID - 1000 }),
        fsDoc('p3', { updatedAt: NOW + 86_400_000, publishedAt: MID - 2000 }),
      ],
      pg: [pgRow('p4', { updatedAt: null as unknown as Date, publishedAt: new Date(MID - 3000) })],
    })
    const lastmods = Object.fromEntries(m.entries)
    expect(lastmods['haber-p1']).toBe(Math.floor(MID / 1000))
    expect(lastmods['haber-p2']).toBe(Math.floor((MID - 1000) / 1000))
    expect(lastmods['haber-p3']).toBe(Math.floor((MID - 2000) / 1000))
    expect(lastmods['pg-p4']).toBe(Math.floor((MID - 3000) / 1000))
    for (const sec of Object.values(lastmods)) expect(sec * 1000).toBeLessThan(NOW)
  })

  it('strict timestamp parsing', () => {
    expect(toEpochMsStrict(null)).toBeNull()
    expect(toEpochMsStrict('')).toBeNull()
    expect(toEpochMsStrict(0)).toBeNull()
    expect(toEpochMsStrict(1_758_000_000)).toBe(1_758_000_000_000)
    expect(toEpochMsStrict({ toMillis: () => MID })).toBe(MID)
    expect(toEpochMsStrict(new Date(MID))).toBe(MID)
  })
})

describe('SEO-1C.1 dedupe + scale', () => {
  it('17. duplicate URL dedupe (Firestore twins with the same slug)', () => {
    const m = build({
      fs: [fsDoc('a1', { slug: 'ayni' }), fsDoc('a2', { slug: 'ayni' }), fsDoc('b')],
    })
    expect(slugs(m).sort()).toEqual(['ayni', 'haber-b'])
  })

  it('18. 50k guard: constant = protocol limit, split into parts, never truncate', () => {
    expect(ARTICLE_SITEMAP_MAX_URLS).toBe(50_000)
    expect(ARTICLE_SITEMAP_MAX_URLS).toBe(SITEMAP_CHUNK_LIMIT)
    expect(partCount(0)).toBe(0)
    expect(partCount(50_000)).toBe(1)
    expect(partCount(50_001)).toBe(2)
    expect(() => partCount(10, 50_001)).toThrow()
    const items = Array.from({ length: 50_001 }, (_, i): [string, number] => [`s${i}`, 1])
    expect(slicePart(items, 1)).toHaveLength(50_000)
    expect(slicePart(items, 2)).toHaveLength(1)
    expect(slicePart(items, 3)).toHaveLength(0)
    expect(() => articleUrlsetXml(BASE, items)).toThrow(/50000/)
    const parts = summarizeArticleMonth({ month: MONTH, entries: items })
    expect(parts.map((p) => p.part)).toEqual([1, 2])
    expect(articleShardFileName(MONTH, 1)).toBe('articles-2026-09.xml')
    expect(articleShardFileName(MONTH, 2)).toBe('articles-2026-09-2.xml')
    expect(parseArticleShardFile('articles-2026-09.xml')).toEqual({ month: MONTH, part: 1 })
    expect(parseArticleShardFile('articles-2026-09-2.xml')).toEqual({ month: MONTH, part: 2 })
    expect(parseArticleShardFile('articles-2026-09-1.xml')).toBeNull()
    expect(parseArticleShardFile('articles-2026-13.xml')).toBeNull()
    expect(parseArticleShardFile('articles-2026-9.xml')).toBeNull()
    expect(parseArticleShardFile('../articles-2026-09.xml')).toBeNull()
  })

  it('entries sorted newest first', () => {
    const m = build({
      fs: [fsDoc('old', { publishedAt: MID - 10_000 }), fsDoc('new', { publishedAt: MID + 10_000 })],
    })
    expect(slugs(m)).toEqual(['haber-new', 'haber-old'])
  })
})

describe('SEO-1C.1 sitemap index', () => {
  it('19. empty month is not advertised; parts + real lastmod are', async () => {
    const months: Record<string, [string, number][]> = {
      '2026-09': [['a', Math.floor((MID + 5000) / 1000)], ['b', Math.floor(MID / 1000)]],
      '2026-08': [],
      '2026-07': [['c', Math.floor(Date.UTC(2026, 6, 3) / 1000)]],
    }
    const items = await getArticleSitemapIndexItems(BASE, {
      listMonths: async () => Object.keys(months),
      getMonth: async (m) => ({ month: m, entries: months[m]! }),
    })
    expect(items).toEqual([
      { loc: `${BASE}/sitemaps/articles-2026-09.xml`, lastmod: new Date(Math.floor((MID + 5000) / 1000) * 1000).toISOString() },
      { loc: `${BASE}/sitemaps/articles-2026-07.xml`, lastmod: new Date(Date.UTC(2026, 6, 3)).toISOString() },
    ])
  })

  it('failed month summary is still listed (without lastmod), never silently dropped', async () => {
    const items = await getArticleSitemapIndexItems(BASE, {
      listMonths: async () => ['2026-09'],
      getMonth: async () => {
        throw new Error('boom')
      },
    })
    expect(items).toEqual([{ loc: `${BASE}/sitemaps/articles-2026-09.xml` }])
  })

  it('month discovery walks the index (1 read per non-empty month) and unions PG months', async () => {
    fsState.calls = []
    fsState.discovery = [Date.UTC(2026, 8, 20), Date.UTC(2026, 8, 2), Date.UTC(2026, 5, 10), Date.UTC(2025, 11, 31, 23)]
    pgState.months = ['2026-07', '2026-09']
    const months = await discoverArticleMonths(NOW)
    expect(months).toEqual(['2026-09', '2026-07', '2026-06', '2025-12'])
    // 3 non-empty Firestore months (09, 06, 2025-12) + 1 terminating empty read; 07 comes from PG
    expect(fsState.calls).toHaveLength(4)
    for (const c of fsState.calls) {
      expect(c.ops).toContainEqual(['where', ['status', '==', 'published']])
      expect(c.ops).toContainEqual(['orderBy', ['publishedAt', 'desc']])
      expect(c.ops).toContainEqual(['limit', [1]])
    }
  })
})

describe('SEO-1C.1 data loading (cost safety)', () => {
  beforeEach(() => {
    fsState.calls = []
    fsState.pages = []
    fsState.fail = false
    pgState.rows = []
    pgState.keys = []
  })

  it('Firestore month query is bounded [monthStart, min(nextMonthStart, now]) with projection and paging', async () => {
    fsState.pages = [
      Array.from({ length: 1000 }, (_, i) => fsDoc(`p${i}`)),
      [fsDoc('last')],
    ]
    const docs = await loadFirestoreMonthDocs(MONTH, NOW)
    expect(docs).toHaveLength(1001)
    expect(fsState.calls).toHaveLength(2)
    const ops = fsState.calls[0]!.ops
    expect(ops).toContainEqual(['where', ['status', '==', 'published']])
    expect(ops).toContainEqual(['where', ['publishedAt', '>=', SEP_START]])
    expect(ops).toContainEqual(['where', ['publishedAt', '<', NOW + 1]])
    expect(ops.find(([n]) => n === 'select')?.[1]).toEqual(expect.arrayContaining(['slug', 'publishedAt', 'updatedAt', 'status']))
    expect(ops).toContainEqual(['limit', [1000]])
    expect(fsState.calls[1]!.ops.some(([n]) => n === 'startAfter')).toBe(true)
  })

  it('closed month upper bound is nextMonthStart', async () => {
    fsState.pages = [[]]
    await loadFirestoreMonthDocs('2026-08', NOW)
    expect(fsState.calls[0]!.ops).toContainEqual(['where', ['publishedAt', '<', SEP_START]])
  })

  it('loadArticleMonth unions Firestore + PG, PG queried for the same UTC window, errors propagate', async () => {
    fsState.pages = [[fsDoc('f1'), fsDoc('dup', { slug: 'pg-p1' })]]
    pgState.rows = [pgRow('p1')]
    pgState.keys = ['p1', 'pg-p1']
    const month = await loadArticleMonth(MONTH, NOW)
    expect(slugs(month).sort()).toEqual(['haber-f1', 'pg-p1'])
    expect(pgState.lastOpts).toMatchObject({ from: new Date(SEP_START), to: new Date(OCT_START), throwOnError: true })

    fsState.fail = true
    await expect(loadArticleMonth(MONTH, NOW)).rejects.toThrow('firestore down')
  })
})

describe('SEO-1C.1 XML', () => {
  it('20. urlset XML is well-formed and protocol-shaped', () => {
    const m = build({
      fs: [fsDoc('x1', { slug: 'amp-&-test' }), fsDoc('x2', { slug: 'çanakkale-haberi' })],
      pg: [pgRow('x3')],
    })
    const xml = articleUrlsetXml(BASE, m.entries)
    expect(XMLValidator.validate(xml)).toBe(true)
    const parsed = new XMLParser().parse(xml)
    const urls = [parsed.urlset.url].flat()
    expect(urls).toHaveLength(3)
    for (const u of urls) {
      expect(String(u.loc)).toMatch(/^https:\/\/www\.nahaber\.com\/haber\//)
      expect(String(u.lastmod)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(xml).toContain('/haber/amp-&amp;-test')
    expect(xml).toContain('/haber/%C3%A7anakkale-haberi')
    expect(xml).not.toContain('<changefreq>')
  })
})
