import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import type { HistoricalRetrievalInput, MemoryEvidence } from './editorialMemoryTypes'

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn(),
  getDb: vi.fn(),
}))

import {
  BUCKETS,
  computeEvidence,
  labelRelationship,
  passesSelfAndFutureExclusion,
  retrieveHistoricalContext,
  rowToReadClass,
  toHistoricalArticleContext,
} from './editorialMemoryRetrieval'

type NewsRow = typeof news.$inferSelect

function baseRow(overrides: Partial<NewsRow> = {}): NewsRow {
  return {
    id: 'hist_1',
    legacyFirestoreId: null,
    slug: 'gecmis-haber-1',
    title: 'Gecmis haber basligi',
    summary: 'Kisa ozet',
    description: null,
    content: null,
    htmlContent: null,
    status: 'published',
    categoryId: 'gundem',
    citySiteId: null,
    cityName: 'Canakkale',
    citySlug: 'canakkale',
    districtName: null,
    districtSlug: null,
    authorId: null,
    authorDisplayName: null,
    source: 'NaHaber',
    sourceUrl: null,
    thumbnailUrl: null,
    coverImageUrl: null,
    videoUrl: null,
    tags: null,
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    isAiGenerated: false,
    editorType: null,
    aiEditorId: null,
    articleFormat: null,
    confidenceScore: null,
    isBreaking: false,
    isFeatured: false,
    isEditorPick: false,
    seoTitle: null,
    seoDescription: null,
    publicationAuthority: null,
    approvedBy: null,
    approvedAt: null,
    publishedBy: null,
    migratedAt: null,
    migrationBatchId: null,
    rightsStatus: 'CLEARED',
    rightsBasis: 'PUBLISHER_ORIGINAL',
    rightsDecidedBy: null,
    rightsDecidedAt: null,
    editorialBlocker: null,
    publishedAt: new Date('2026-06-01T00:00:00Z'),
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  } as NewsRow
}

const baseInput: HistoricalRetrievalInput = {
  headline: 'Izmir Konakta trafik kazasi: 3 yarali',
  summary: 'Izmir Konakta meydana gelen trafik kazasinda 3 kisi yaralandi.',
  categoryId: 'gundem',
  citySlug: 'izmir',
  districtSlug: null,
  publishedAt: '2026-09-01T12:00:00.000Z',
}

describe('Faz A3 - BUCKETS (age-bucket sanity)', () => {
  it('is contiguous, ascending, and the last bucket is open-ended', () => {
    expect(BUCKETS[0].minHoursAgo).toBe(48)
    for (let i = 1; i < BUCKETS.length; i++) {
      expect(BUCKETS[i].minHoursAgo).toBe(BUCKETS[i - 1].maxHoursAgo)
    }
    expect(BUCKETS[BUCKETS.length - 1].maxHoursAgo).toBeNull()
    expect(BUCKETS.map((b) => b.id)).toEqual(['2-7d', '8-30d', '1-3mo', '3-12mo', '12mo+'])
  })
})

describe('Faz A3 Task 9 - computeEvidence (deterministic evidence)', () => {
  it('produces no evidence when nothing overlaps (Task 20 - zero-signal candidate)', () => {
    const candidate = baseRow({
      title: 'Zzyxw qqvv tamamen ilgisiz metin',
      summary: null,
      description: null,
      citySlug: 'trabzon',
      categoryId: 'spor',
    })
    const input: HistoricalRetrievalInput = {
      headline: 'Portakal muz elma armut',
      summary: null,
      categoryId: 'ekonomi',
      citySlug: 'izmir',
    }
    expect(computeEvidence(input, candidate)).toEqual([])
  })

  it('detects SHARED_GEO and SHARED_TOPIC_TOKEN from exact city/category match', () => {
    const candidate = baseRow({ citySlug: 'izmir', categoryId: 'gundem', title: 'x', summary: null })
    const evidence = computeEvidence({ ...baseInput, headline: 'x', summary: null }, candidate)
    const tags = evidence.map((e) => e.tag)
    expect(tags).toContain('SHARED_GEO')
    expect(tags).toContain('SHARED_TOPIC_TOKEN')
    expect(evidence.find((e) => e.tag === 'SHARED_GEO')?.weight).toBe(1)
    expect(evidence.find((e) => e.tag === 'SHARED_TOPIC_TOKEN')?.weight).toBe(0.4)
  })

  it('identical headline/title/summary yields maximal TITLE_OVERLAP, SUMMARY_OVERLAP and SHARED_NUMBER', () => {
    const candidate = baseRow({
      title: baseInput.headline,
      summary: baseInput.summary,
      citySlug: 'izmir',
      categoryId: 'gundem',
    })
    const evidence = computeEvidence(baseInput, candidate)
    const byTag = new Map(evidence.map((e) => [e.tag, e.weight]))
    expect(byTag.get('TITLE_OVERLAP')).toBe(1)
    expect(byTag.get('SUMMARY_OVERLAP')).toBe(1)
    expect(byTag.get('SHARED_NUMBER')).toBeGreaterThan(0)
    expect(byTag.has('SHARED_GEO')).toBe(true)
    expect(byTag.has('SHARED_TOPIC_TOKEN')).toBe(true)
  })

  it('every evidence entry carries a human-readable label (Task 14)', () => {
    const candidate = baseRow({ title: baseInput.headline, summary: baseInput.summary })
    const evidence = computeEvidence(baseInput, candidate)
    for (const e of evidence) {
      expect(typeof e.labelTr).toBe('string')
      expect(e.labelTr.length).toBeGreaterThan(0)
    }
  })
})

describe('Faz A3 Task 10 - labelRelationship (conservative combination rule)', () => {
  const tag = (t: MemoryEvidence['tag'], weight: number): MemoryEvidence => ({
    tag: t,
    weight,
    labelTr: t,
  })

  it('no evidence -> UNRESOLVED', () => {
    expect(labelRelationship([])).toBe('UNRESOLVED')
  })

  it('a LONE named-token match is never promoted - stays UNRESOLVED regardless of weight', () => {
    expect(labelRelationship([tag('SHARED_NAMED_TOKEN', 0.99)])).toBe('UNRESOLVED')
  })

  it('a single non-named signal -> POSSIBLY_RELATED (never SAME_EVENT)', () => {
    expect(labelRelationship([tag('SHARED_GEO', 1)])).toBe('POSSIBLY_RELATED')
  })

  it('two weak signals, no strong title / no (named+geo) -> POSSIBLY_RELATED', () => {
    expect(labelRelationship([tag('SHARED_GEO', 1), tag('SHARED_TOPIC_TOKEN', 0.4)])).toBe(
      'POSSIBLY_RELATED'
    )
  })

  it('>=3 signals but none strong enough -> stays POSSIBLY_RELATED, never LIKELY_RELATED', () => {
    const evidence = [tag('SHARED_TOPIC_TOKEN', 0.4), tag('SUMMARY_OVERLAP', 0.2), tag('SHARED_NUMBER', 0.2)]
    expect(labelRelationship(evidence)).toBe('POSSIBLY_RELATED')
  })

  it('>=3 signals with strong TITLE_OVERLAP -> LIKELY_RELATED', () => {
    const evidence = [tag('SHARED_GEO', 1), tag('SHARED_TOPIC_TOKEN', 0.4), tag('TITLE_OVERLAP', 0.6)]
    expect(labelRelationship(evidence)).toBe('LIKELY_RELATED')
  })

  it('>=3 signals with strong named-token overlap AND shared geo -> LIKELY_RELATED', () => {
    const evidence = [tag('SHARED_GEO', 1), tag('SHARED_NAMED_TOKEN', 0.5), tag('SHARED_NUMBER', 0.3)]
    expect(labelRelationship(evidence)).toBe('LIKELY_RELATED')
  })

  it('never returns SAME_EVENT or VERIFIED_FACT for any input', () => {
    const combos: MemoryEvidence[][] = [
      [],
      [tag('SHARED_GEO', 1)],
      [tag('SHARED_GEO', 1), tag('SHARED_NAMED_TOKEN', 1), tag('TITLE_OVERLAP', 1), tag('SHARED_NUMBER', 1)],
    ]
    for (const evidence of combos) {
      const result = labelRelationship(evidence)
      expect(['LIKELY_RELATED', 'POSSIBLY_RELATED', 'UNRESOLVED']).toContain(result)
    }
  })
})

describe('Faz A3 Task 11 - toHistoricalArticleContext (CANONICAL-only fail-closed invariant)', () => {
  const evidence: MemoryEvidence[] = [{ tag: 'SHARED_GEO', weight: 1, labelTr: 'Ayni sehir' }]

  it('returns a CANONICAL/HIGH context for an ordinary canonical PG row', () => {
    const ctx = toHistoricalArticleContext(baseRow(), evidence, '1-3mo', 0.85)
    expect(ctx).not.toBeNull()
    expect(ctx?.publicReadClass).toBe('CANONICAL')
    expect(ctx?.trustTier).toBe('HIGH')
  })

  it('fails closed (returns null) when publicationAuthority is SYSTEM_ALERT', () => {
    const ctx = toHistoricalArticleContext(
      baseRow({ publicationAuthority: 'SYSTEM_ALERT' }),
      evidence,
      '1-3mo',
      0.85
    )
    expect(ctx).toBeNull()
  })

  it('fails closed (returns null) when the row is not actually published', () => {
    const ctx = toHistoricalArticleContext(baseRow({ status: 'draft' }), evidence, '1-3mo', 0.85)
    expect(ctx).toBeNull()
  })

  it('fails closed (returns null) when publishedAt is null', () => {
    const ctx = toHistoricalArticleContext(baseRow({ publishedAt: null }), evidence, '1-3mo', 0.85)
    expect(ctx).toBeNull()
  })

  it('rowToReadClass classifies an ordinary canonical row as CANONICAL', () => {
    expect(rowToReadClass(baseRow())).toBe('CANONICAL')
  })
})

describe('Faz A3 Task 6 - passesSelfAndFutureExclusion (defense-in-depth, independent of SQL)', () => {
  const referenceTime = new Date('2026-09-01T12:00:00.000Z')
  const input: HistoricalRetrievalInput = { headline: 'x', articleId: 'self_1', slug: 'self-slug' }

  it('excludes the current article by id', () => {
    expect(passesSelfAndFutureExclusion(baseRow({ id: 'self_1', slug: 'other-slug' }), input, referenceTime)).toBe(
      false
    )
  })

  it('excludes the current article by slug', () => {
    expect(passesSelfAndFutureExclusion(baseRow({ id: 'other_id', slug: 'self-slug' }), input, referenceTime)).toBe(
      false
    )
  })

  it('excludes anything published at/after the reference time', () => {
    const future = baseRow({ id: 'x1', slug: 'x1', publishedAt: new Date('2026-09-01T12:00:00.001Z') })
    expect(passesSelfAndFutureExclusion(future, input, referenceTime)).toBe(false)
    const exact = baseRow({ id: 'x2', slug: 'x2', publishedAt: referenceTime })
    expect(passesSelfAndFutureExclusion(exact, input, referenceTime)).toBe(false)
  })

  it('excludes rows with a null publishedAt', () => {
    expect(
      passesSelfAndFutureExclusion(baseRow({ id: 'x3', slug: 'x3', publishedAt: null }), input, referenceTime)
    ).toBe(false)
  })

  it('accepts a genuinely distinct, genuinely past row', () => {
    const past = baseRow({
      id: 'other_id',
      slug: 'other-slug',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    })
    expect(passesSelfAndFutureExclusion(past, input, referenceTime)).toBe(true)
  })
})

function mockDbReturning(rowsPerBucketCall: NewsRow[][]) {
  let call = 0
  const builder = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => rowsPerBucketCall[call++] ?? [],
          }),
        }),
      }),
    }),
  }
  vi.mocked(getDb).mockReturnValue(builder as unknown as ReturnType<typeof getDb>)
}

describe('Faz A3 - retrieveHistoricalContext (end-to-end, DB mocked - READ ONLY)', () => {
  afterEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(hasDatabaseUrl).mockReset()
  })

  it('NO_DATABASE_URL short-circuits before ever calling getDb - proves zero DB access when disabled', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(false)
    const result = await retrieveHistoricalContext({ headline: 'herhangi bir baslik' })
    expect(result).toEqual({ results: [], noResultReason: 'NO_DATABASE_URL' })
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })

  it('rejects an empty headline before querying (Task 5 input contract)', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const result = await retrieveHistoricalContext({ headline: '   ' })
    expect(result.noResultReason).toBe('NO_CANONICAL_CANDIDATES')
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })

  it('a valid zero-result answer (empty canonical archive) IS a valid result - Task 15', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    mockDbReturning([[], [], [], [], []])
    const result = await retrieveHistoricalContext(baseInput)
    expect(result.results).toEqual([])
    expect(result.noResultReason).toBe('NO_CANONICAL_CANDIDATES')
    expect(result.candidatesConsideredByBucket).toEqual({
      '2-7d': 0,
      '8-30d': 0,
      '1-3mo': 0,
      '3-12mo': 0,
      '12mo+': 0,
    })
  })

  it('rows with zero shared signal are considered but never returned - NO_CANDIDATES_PASSED_SAFETY_FILTER', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const unrelated = baseRow({
      id: 'u1',
      slug: 'u1',
      title: 'Zzyxw qqvv tamamen ilgisiz metin',
      summary: null,
      description: null,
      citySlug: 'trabzon',
      categoryId: 'spor',
    })
    mockDbReturning([[unrelated], [], [], [], []])
    const result = await retrieveHistoricalContext(baseInput)
    expect(result.results).toEqual([])
    expect(result.noResultReason).toBe('NO_CANDIDATES_PASSED_SAFETY_FILTER')
    expect(result.candidatesConsideredByBucket?.['2-7d']).toBe(1)
  })

  it('dedupes the same article across buckets, keeping the higher-scored (fresher-bucket) copy', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const strongMatch = baseRow({
      id: 'dup_1',
      slug: 'dup-1',
      title: baseInput.headline,
      summary: baseInput.summary,
      citySlug: baseInput.citySlug,
      categoryId: baseInput.categoryId,
    })
    mockDbReturning([[strongMatch], [strongMatch], [], [], []])
    const result = await retrieveHistoricalContext(baseInput)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].articleId).toBe('dup_1')
    expect(result.results[0].ageBucket).toBe('2-7d')
  })

  it('excludes self (by id/slug) and future-published rows even though the mocked DB does not filter them', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const selfRow = baseRow({
      id: 'self_article',
      slug: 'self-slug',
      title: baseInput.headline,
      summary: baseInput.summary,
      citySlug: baseInput.citySlug,
      categoryId: baseInput.categoryId,
    })
    const futureRow = baseRow({
      id: 'future_1',
      slug: 'future-1',
      title: baseInput.headline,
      summary: baseInput.summary,
      citySlug: baseInput.citySlug,
      categoryId: baseInput.categoryId,
      publishedAt: new Date('2026-12-01T00:00:00.000Z'),
    })
    mockDbReturning([[selfRow, futureRow], [], [], [], []])
    const result = await retrieveHistoricalContext({
      ...baseInput,
      articleId: 'self_article',
      slug: 'self-slug',
    })
    expect(result.results).toEqual([])
    expect(result.noResultReason).toBe('NO_CANDIDATES_PASSED_SAFETY_FILTER')
  })

  it('happy path returns well-matched CANONICAL candidates, capped at MAX_RESULTS, never AI-touched', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const rows = Array.from({ length: 7 }, (_, i) =>
      baseRow({
        id: `match_${i}`,
        slug: `match-${i}`,
        title: baseInput.headline,
        summary: baseInput.summary,
        citySlug: baseInput.citySlug,
        categoryId: baseInput.categoryId,
        publishedAt: new Date('2026-07-01T00:00:00.000Z'),
      })
    )
    mockDbReturning([rows, [], [], [], []])
    const result = await retrieveHistoricalContext(baseInput)
    expect(result.results.length).toBeLessThanOrEqual(5)
    expect(result.results.length).toBeGreaterThan(0)
    for (const r of result.results) {
      expect(r.publicReadClass).toBe('CANONICAL')
      expect(r.trustTier).toBe('HIGH')
      expect(['LIKELY_RELATED', 'POSSIBLY_RELATED', 'UNRESOLVED']).toContain(r.relationshipConfidence)
      expect(Array.isArray(r.evidence)).toBe(true)
    }
  })

  it('a thrown query error is reported as QUERY_ERROR, not fabricated as an empty-but-successful result', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                throw new Error('simulated connection error')
              },
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getDb>)
    const result = await retrieveHistoricalContext(baseInput)
    expect(result.noResultReason).toBe('QUERY_ERROR')
    expect(result.results).toEqual([])
  })
})
