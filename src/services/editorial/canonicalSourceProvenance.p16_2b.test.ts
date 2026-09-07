import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, hasDatabaseUrl } from '@/db'
import { newsClusters, clusterMemberships, newsSources, rawArticles } from '@/db/schema/crawler'

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn(),
  getDb: vi.fn(),
}))

import { resolveCanonicalNewsSources } from './canonicalSourceProvenance'

type ClusterRow = { id: string }
type MembershipRow = {
  membershipRole: string | null
  createdAt: Date | string | null
  sourceId: string | null
  articleId: string | null
}
type SourceRow = { id: string; name: string }
type ArticleRow = {
  id: string
  canonicalUrl: string | null
  originalUrl: string | null
  publishedAt: Date | string | null
}

/**
 * Mocks the exact drizzle call shapes used by resolveCanonicalNewsSources:
 *   news_clusters:      select(...).from(newsClusters).where(...).limit(1)
 *   cluster_memberships: select(...).from(clusterMemberships).where(...)          [awaited directly]
 *   news_sources:        select(...).from(newsSources).where(...)                 [awaited directly]
 *   raw_articles:        select(...).from(rawArticles).where(...)                 [awaited directly]
 *
 * Dispatches on the actual table object identity passed to `.from()`, so the
 * mock stays honest about which table produced which rows — no call-order
 * guessing.
 */
function mockDb(fixture: {
  clusters?: ClusterRow[]
  memberships?: MembershipRow[]
  sources?: SourceRow[]
  articles?: ArticleRow[]
}) {
  const db = {
    select: (_sel?: unknown) => ({
      from: (table: unknown) => {
        if (table === newsClusters) {
          return { where: () => ({ limit: async () => fixture.clusters ?? [] }) }
        }
        if (table === clusterMemberships) {
          return { where: async () => fixture.memberships ?? [] }
        }
        if (table === newsSources) {
          return { where: async () => fixture.sources ?? [] }
        }
        if (table === rawArticles) {
          return { where: async () => fixture.articles ?? [] }
        }
        throw new Error('canonicalSourceProvenance test mock: unexpected table in .from()')
      },
    }),
  }
  vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>)
}

describe('P16.2B — resolveCanonicalNewsSources (read-only provenance bridge)', () => {
  afterEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(hasDatabaseUrl).mockReset()
  })

  it('CASE 1: 1 PRIMARY + 2 SUPPORTING → returns all 3 real sources with correct roles', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({
      clusters: [{ id: 'cluster_1' }],
      memberships: [
        { membershipRole: 'PRIMARY', createdAt: '2026-09-01T10:00:00Z', sourceId: 'src_aa', articleId: 'art_aa' },
        { membershipRole: 'SUPPORTING', createdAt: '2026-09-01T10:05:00Z', sourceId: 'src_valilik', articleId: 'art_valilik' },
        { membershipRole: 'SUPPORTING', createdAt: '2026-09-01T10:10:00Z', sourceId: 'src_yerel', articleId: 'art_yerel' },
      ],
      sources: [
        { id: 'src_aa', name: 'AA' },
        { id: 'src_valilik', name: 'Çanakkale Valiliği' },
        { id: 'src_yerel', name: 'Yerel Gazete X' },
      ],
      articles: [
        { id: 'art_aa', canonicalUrl: 'https://aa.com.tr/haber/1', originalUrl: null, publishedAt: '2026-09-01T09:55:00Z' },
        { id: 'art_valilik', canonicalUrl: null, originalUrl: 'https://canakkale.gov.tr/duyuru/1', publishedAt: '2026-09-01T10:00:00Z' },
        { id: 'art_yerel', canonicalUrl: null, originalUrl: 'https://yerelgazete.com/haber/1', publishedAt: '2026-09-01T10:02:00Z' },
      ],
    })

    const result = await resolveCanonicalNewsSources('news_123')

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ name: 'AA', role: 'PRIMARY', url: 'https://aa.com.tr/haber/1' })
    expect(result.filter((s) => s.role === 'SUPPORTING').map((s) => s.name).sort()).toEqual([
      'Yerel Gazete X',
      'Çanakkale Valiliği',
    ])
  })

  it('CASE 2: no cluster lineage → returns [] (caller falls back to news.source/sourceUrl)', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({ clusters: [] })

    const result = await resolveCanonicalNewsSources('news_legacy')
    expect(result).toEqual([])
  })

  it('CASE 3a: cluster exists but membership list is empty → returns [], no crash', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({ clusters: [{ id: 'cluster_2' }], memberships: [] })

    const result = await resolveCanonicalNewsSources('news_456')
    expect(result).toEqual([])
  })

  it('CASE 3b: membership references a source_id that no longer resolves → skipped, not thrown', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({
      clusters: [{ id: 'cluster_3' }],
      memberships: [
        { membershipRole: 'PRIMARY', createdAt: null, sourceId: 'src_ghost', articleId: 'art_ghost' },
      ],
      sources: [], // orphaned FK — source row missing
      articles: [],
    })

    const result = await resolveCanonicalNewsSources('news_789')
    expect(result).toEqual([])
  })

  it('CASE 3c: hasDatabaseUrl() false → returns [] before ever calling getDb (no DB access)', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(false)
    const result = await resolveCanonicalNewsSources('news_any')
    expect(result).toEqual([])
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })

  it('CASE 3d: DB throws mid-query → caught internally, returns [] (never propagates)', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              throw new Error('simulated DB outage')
            },
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getDb>)

    await expect(resolveCanonicalNewsSources('news_outage')).resolves.toEqual([])
  })

  it('CASE 4: lookup is keyed only by newsId — identical DB state before/after a hypothetical rewrite yields identical provenance', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const fixture = {
      clusters: [{ id: 'cluster_4' }],
      memberships: [
        { membershipRole: 'PRIMARY', createdAt: '2026-09-01T10:00:00Z', sourceId: 'src_trt', articleId: 'art_trt' },
      ],
      sources: [{ id: 'src_trt', name: 'TRT Haber' }],
      articles: [
        { id: 'art_trt', canonicalUrl: 'https://trthaber.com/1', originalUrl: null, publishedAt: '2026-09-01T09:00:00Z' },
      ],
    }

    // "Before rewrite"
    mockDb(fixture)
    const before = await resolveCanonicalNewsSources('news_rewrite')

    // "After rewrite" — same cluster/membership/source/article rows (a
    // headline/body rewrite never touches these tables); resolver takes
    // only newsId as input, so it cannot see or depend on the rewritten text.
    mockDb(fixture)
    const after = await resolveCanonicalNewsSources('news_rewrite')

    expect(after).toEqual(before)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ name: 'TRT Haber', role: 'PRIMARY' })
  })

  it('CASE 5: resolver never reads or writes rights fields — mock DB exposes no update/insert/delete surface', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    // A db object with ONLY `select` — if resolver ever attempted to update
    // rightsStatus/rightsBasis/editorialBlocker/publicationAuthority this
    // would throw (no such method exists on the mock), failing the test.
    mockDb({
      clusters: [{ id: 'cluster_5' }],
      memberships: [
        { membershipRole: 'SUPPORTING', createdAt: '2026-09-01T10:00:00Z', sourceId: 'src_x', articleId: 'art_x' },
      ],
      sources: [{ id: 'src_x', name: 'Kaynak X' }],
      articles: [{ id: 'art_x', canonicalUrl: 'https://x.com/1', originalUrl: null, publishedAt: null }],
    })

    const result = await resolveCanonicalNewsSources('news_rights_safe')
    expect(result).toHaveLength(1)
    // Structural guarantee: CanonicalSourceRef has no rights-related keys.
    expect(Object.keys(result[0]).sort()).toEqual(['name', 'publishedAt', 'role', 'url'])
  })

  it('CASE 6: same real source contributing 2 memberships is deduped to one entry, keeping the best-ranked role/URL', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({
      clusters: [{ id: 'cluster_6' }],
      memberships: [
        // SUPPORTING membership arrives first in raw order, but PRIMARY for
        // the same sourceId must still win the dedup (deterministic rank).
        { membershipRole: 'SUPPORTING', createdAt: '2026-09-01T09:00:00Z', sourceId: 'src_dup', articleId: 'art_dup_old' },
        { membershipRole: 'PRIMARY', createdAt: '2026-09-01T09:05:00Z', sourceId: 'src_dup', articleId: 'art_dup_new' },
        { membershipRole: 'SUPPORTING', createdAt: '2026-09-01T09:10:00Z', sourceId: 'src_other', articleId: 'art_other' },
      ],
      sources: [
        { id: 'src_dup', name: 'Tekrarlayan Kaynak' },
        { id: 'src_other', name: 'Diğer Kaynak' },
      ],
      articles: [
        { id: 'art_dup_old', canonicalUrl: 'https://dup.com/old', originalUrl: null, publishedAt: null },
        { id: 'art_dup_new', canonicalUrl: 'https://dup.com/new', originalUrl: null, publishedAt: null },
        { id: 'art_other', canonicalUrl: 'https://other.com/1', originalUrl: null, publishedAt: null },
      ],
    })

    const result = await resolveCanonicalNewsSources('news_dedup')

    const names = result.map((s) => s.name)
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2) // no duplicate identity shown to the user

    const dup = result.find((s) => s.name === 'Tekrarlayan Kaynak')
    expect(dup?.role).toBe('PRIMARY')
    expect(dup?.url).toBe('https://dup.com/new')
  })

  it('CASE 7a: unsafe URL scheme (javascript:) is never rendered as a link — resolves to url:null, no throw', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({
      clusters: [{ id: 'cluster_7' }],
      memberships: [
        { membershipRole: 'PRIMARY', createdAt: null, sourceId: 'src_unsafe', articleId: 'art_unsafe' },
      ],
      sources: [{ id: 'src_unsafe', name: 'Şüpheli Kaynak' }],
      articles: [
        { id: 'art_unsafe', canonicalUrl: 'javascript:alert(1)', originalUrl: null, publishedAt: null },
      ],
    })

    const result = await resolveCanonicalNewsSources('news_unsafe_url')
    expect(result).toHaveLength(1)
    expect(result[0].url).toBeNull()
    expect(result[0].name).toBe('Şüpheli Kaynak')
  })

  it('CASE 7b: missing URL on both canonicalUrl and originalUrl → url:null, entry still shown by name', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDb({
      clusters: [{ id: 'cluster_8' }],
      memberships: [
        { membershipRole: 'SUPPORTING', createdAt: null, sourceId: 'src_nourl', articleId: 'art_nourl' },
      ],
      sources: [{ id: 'src_nourl', name: 'URL Yok Kaynağı' }],
      articles: [{ id: 'art_nourl', canonicalUrl: null, originalUrl: null, publishedAt: null }],
    })

    const result = await resolveCanonicalNewsSources('news_no_url')
    expect(result).toHaveLength(1)
    expect(result[0].url).toBeNull()
  })

  it('empty/whitespace newsId short-circuits without querying', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const result = await resolveCanonicalNewsSources('   ')
    expect(result).toEqual([])
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })
})
