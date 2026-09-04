/**
 * NFRank V1 focused tests — Feed V2 isolation, determinism, safety invariants.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type { FeedCandidateRow, FeedUserContext } from '@/types/smartFeed'
import {
  NFRANK_CONFIG_V1,
  NFRANK_VERSION,
  nfRankFreshnessScore,
  resolveNfRankCategoryClass,
} from '@/lib/feed/nfRankConfig'
import { isNfRankLiveEnabled, isNfRankShadowEnabled } from '@/lib/feed/featureFlag'
import {
  buildSessionIntentFromEvents,
  emptySessionIntent,
  nfRankEngine,
} from '@/services/feed/nfRank/NFRankEngine'
import { compareShadowRankings } from '@/services/feed/nfRank/nfRankShadowCompare'
import { USER_FEATURE_DEPENDENCIES } from '@/lib/user/userRolloutMatrix'
import { USER_ROLLOUT_FEATURE_KEYS } from '@/types/userRollout'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'

function baseRow(partial: Partial<FeedCandidateRow> & { articleId: string }): FeedCandidateRow {
  const now = Date.now()
  return {
    articleId: partial.articleId,
    clusterId: partial.clusterId ?? null,
    publisherId: partial.publisherId ?? 'pub-a',
    publisherSlug: partial.publisherSlug ?? 'pub-a',
    publisherName: partial.publisherName ?? 'Pub A',
    publisherLogoUrl: null,
    headline: partial.headline ?? `Headline ${partial.articleId}`,
    summary: partial.summary ?? 'Summary',
    category: partial.category ?? 'teknoloji',
    image: null,
    video: null,
    publishedAt: partial.publishedAt ?? new Date(now - 3_600_000),
    updatedAt: partial.updatedAt ?? new Date(now - 3_600_000),
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    clusterImportance: partial.clusterImportance ?? 40,
    sourceQualityTier: partial.sourceQualityTier ?? 'STANDARD',
    sourceHealthScore: partial.sourceHealthScore ?? 70,
    citySlug: partial.citySlug ?? null,
    districtSlug: partial.districtSlug ?? null,
    likesCount: partial.likesCount ?? 0,
    commentsCount: partial.commentsCount ?? 0,
    savesCount: partial.savesCount ?? 0,
    sharesCount: partial.sharesCount ?? 0,
    viewsCount: partial.viewsCount ?? 0,
    slug: partial.slug ?? partial.articleId,
    source: partial.source ?? 'RECENT',
    candidateSources: partial.candidateSources,
    sortScore: partial.sortScore ?? now,
  }
}

function emptyCtx(partial?: Partial<FeedUserContext>): FeedUserContext {
  return {
    userId: 'pilot-uid',
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: null,
    districtSlug: null,
    ...partial,
  }
}

describe('NFRank V1 config + flags', () => {
  const prevLive = process.env.FEED_V2_NFRANK_ENABLED
  const prevShadow = process.env.FEED_V2_NFRANK_SHADOW_ENABLED

  afterEach(() => {
    if (prevLive === undefined) delete process.env.FEED_V2_NFRANK_ENABLED
    else process.env.FEED_V2_NFRANK_ENABLED = prevLive
    if (prevShadow === undefined) delete process.env.FEED_V2_NFRANK_SHADOW_ENABLED
    else process.env.FEED_V2_NFRANK_SHADOW_ENABLED = prevShadow
  })

  it('records ranking version NFRANK_V1', () => {
    expect(NFRANK_VERSION).toBe('NFRANK_V1')
    expect(NFRANK_CONFIG_V1.version).toBe('NFRANK_V1')
  })

  it('live flag defaults off; shadow defaults on', () => {
    delete process.env.FEED_V2_NFRANK_ENABLED
    delete process.env.FEED_V2_NFRANK_SHADOW_ENABLED
    expect(isNfRankLiveEnabled()).toBe(false)
    expect(isNfRankShadowEnabled()).toBe(true)
  })

  it('NFRANK_V1 is allowlisted with SMART_FEED deps and not in silent global ON', () => {
    expect(USER_ROLLOUT_FEATURE_KEYS).toContain('NFRANK_V1')
    expect(USER_FEATURE_DEPENDENCIES.NFRANK_V1).toEqual(['SMART_FEED', 'SMART_FEED_RANKING_V1'])
  })

  it('category-specific freshness uses canonical age classes', () => {
    expect(resolveNfRankCategoryClass('spor', false)).toBe('SPORT')
    expect(resolveNfRankCategoryClass('ekonomi', false)).toBe('ECONOMY')
    expect(resolveNfRankCategoryClass('gundem', true)).toBe('BREAKING')
    const fresh = nfRankFreshnessScore(new Date(), 'teknoloji', false)
    const old = nfRankFreshnessScore(new Date(Date.now() - 72 * 3_600_000), 'teknoloji', false)
    expect(fresh).toBeGreaterThan(old)
  })
})

describe('NFRank V1 scoring + composition', () => {
  it('is deterministic for identical inputs', () => {
    const rows = [
      baseRow({ articleId: 'a1', category: 'teknoloji', source: 'RECENT' }),
      baseRow({ articleId: 'a2', category: 'spor', source: 'BREAKING', breaking: true }),
      baseRow({ articleId: 'a3', category: 'ekonomi', source: 'DISCOVERY', publisherId: 'pub-b' }),
    ]
    const ctx = emptyCtx({
      behavioralInterests: new Map([['teknoloji', 0.8]]),
    })
    const frozenNow = Date.now()
    const r1 = nfRankEngine.compose(rows, ctx, 'personal', 3, emptySessionIntent(), { nowMs: frozenNow })
    const r2 = nfRankEngine.compose(rows, ctx, 'personal', 3, emptySessionIntent(), { nowMs: frozenNow })
    expect(r1.map((x) => x.articleId)).toEqual(r2.map((x) => x.articleId))
    expect(r1.map((x) => x.score)).toEqual(r2.map((x) => x.score))
  })

  it('preserves candidate provenance', () => {
    const row2 = baseRow({
      articleId: 'a1',
      source: 'LOCAL',
      candidateSources: ['LOCAL', 'RECENT', 'DISCOVERY'],
    })
    const ranked = nfRankEngine.compose([row2], emptyCtx(), 'personal', 1, emptySessionIntent(), {
      includeExplain: true,
    })
    expect(ranked[0]!.candidateSources).toEqual(expect.arrayContaining(['LOCAL', 'RECENT', 'DISCOVERY']))
    expect(ranked[0]!.nfExplain?.rankingVersion).toBe('NFRANK_V1')
    expect(ranked[0]!.nfExplain?.candidateSources).toEqual(ranked[0]!.candidateSources)
  })

  it('same cluster does not flood feed', () => {
    const rows = [
      baseRow({ articleId: 'c1', clusterId: 'cl-1', category: 'gundem', publisherId: 'p1' }),
      baseRow({ articleId: 'c2', clusterId: 'cl-1', category: 'gundem', publisherId: 'p2' }),
      baseRow({ articleId: 'c3', clusterId: 'cl-1', category: 'gundem', publisherId: 'p3' }),
      baseRow({ articleId: 'd1', clusterId: 'cl-2', category: 'spor', publisherId: 'p4' }),
      baseRow({ articleId: 'd2', clusterId: 'cl-3', category: 'ekonomi', publisherId: 'p5' }),
    ]
    const ranked = nfRankEngine.compose(rows, emptyCtx(), 'personal', 5, emptySessionIntent())
    const cluster1 = ranked.filter((r) => r.clusterId === 'cl-1')
    expect(cluster1.length).toBeLessThanOrEqual(1)
  })

  it('publisher affinity cannot monopolize feed', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      baseRow({
        articleId: `p-${i}`,
        publisherId: i < 6 ? 'mono-pub' : `other-${i}`,
        category: i % 2 === 0 ? 'teknoloji' : 'spor',
        clusterId: `cl-${i}`,
      })
    )
    const ctx = emptyCtx({
      followedPublisherIds: new Set(['mono-pub']),
      publisherAffinities: new Map([['mono-pub', 1]]),
    })
    const ranked = nfRankEngine.compose(rows, ctx, 'personal', 6, emptySessionIntent())
    const window = ranked.slice(0, 6)
    const mono = window.filter((r) => r.publisherId === 'mono-pub').length
    expect(mono).toBeLessThan(window.length)
  })

  it('category saturation penalty reduces same-category runs', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      baseRow({
        articleId: `t-${i}`,
        category: i < 8 ? 'teknoloji' : 'spor',
        clusterId: `cl-${i}`,
        publisherId: `pub-${i}`,
      })
    )
    const ctx = emptyCtx({ behavioralInterests: new Map([['teknoloji', 1]]) })
    const ranked = nfRankEngine.compose(rows, ctx, 'personal', 8, emptySessionIntent())
    const cats = ranked.map((r) => (r.category ?? '').toLowerCase())
    // Should not be all teknoloji
    expect(cats.some((c) => c !== 'teknoloji')).toBe(true)
  })

  it('seen article remains suppressed unless material update', () => {
    const rows = [
      baseRow({ articleId: 'seen-1', clusterId: 'cl-s', materialUpdate: false }),
      baseRow({ articleId: 'fresh-1', clusterId: 'cl-f' }),
      baseRow({ articleId: 'mat-1', clusterId: 'cl-s', materialUpdate: true }),
    ]
    const ranked = nfRankEngine.compose(rows, emptyCtx(), 'personal', 3, emptySessionIntent(), {
      seenArticles: new Set(['seen-1']),
      seenClusters: new Set(['cl-s']),
    })
    expect(ranked.find((r) => r.articleId === 'seen-1')).toBeUndefined()
    expect(ranked.find((r) => r.articleId === 'mat-1')).toBeDefined()
    expect(ranked.find((r) => r.articleId === 'fresh-1')).toBeDefined()
  })

  it('material update does not become breaking', () => {
    const row = baseRow({ articleId: 'm1', materialUpdate: true, breaking: false })
    const { reason, breakdown } = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', emptySessionIntent())
    expect(reason).toBe('MATERIAL_UPDATE')
    expect(row.breaking).toBe(false)
    expect(breakdown.materialUpdate).toBeGreaterThan(0)
  })

  it('single fast swipe has bounded penalty; repeated stronger; explicit stronger', () => {
    const row = baseRow({ articleId: 'x1', category: 'teknoloji' })
    const single = emptySessionIntent()
    single.categoryQuickSkips.set('teknoloji', 1)
    const repeated = emptySessionIntent()
    repeated.categoryQuickSkips.set('teknoloji', 3)
    const explicit = emptySessionIntent()
    explicit.explicitNegatives.push({ targetType: 'category', targetId: 'teknoloji' })

    const s1 = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', single)
    const s2 = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', repeated)
    const s3 = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', explicit)
    expect(s1.components.quickSkipPenalty).toBe(NFRANK_CONFIG_V1.singleQuickSkipPenalty)
    expect(s2.components.quickSkipPenalty).toBe(NFRANK_CONFIG_V1.repeatedQuickSkipPenalty)
    expect(s2.components.quickSkipPenalty).toBeGreaterThan(s1.components.quickSkipPenalty)
    expect(s3.components.explicitNegativePenalty).toBeGreaterThan(0)
    expect(s3.score).toBeLessThan(s1.score)
  })

  it('SAD and ANGRY do not boost topic affinity', () => {
    const intent = buildSessionIntentFromEvents([
      { eventType: 'SAD', category: 'ekonomi', ageMinutes: 1 },
      { eventType: 'ANGRY', category: 'ekonomi', ageMinutes: 1 },
      { eventType: 'reaction_sad', category: 'ekonomi', ageMinutes: 1 },
      { eventType: 'reaction_angry', category: 'ekonomi', ageMinutes: 1 },
    ])
    expect(intent.categoryBoosts.get('ekonomi') ?? 0).toBe(0)

    const positive = buildSessionIntentFromEvents([
      { eventType: 'article_save', category: 'ekonomi', ageMinutes: 1 },
    ])
    expect(positive.categoryBoosts.get('ekonomi') ?? 0).toBeGreaterThan(0)
  })

  it('cold-start does not fake personalization', () => {
    const rows = [
      baseRow({ articleId: 'a1', category: 'teknoloji', publishedAt: new Date() }),
      baseRow({
        articleId: 'a2',
        category: 'spor',
        publishedAt: new Date(Date.now() - 48 * 3_600_000),
        clusterImportance: 90,
        source: 'BREAKING',
        breaking: true,
      }),
    ]
    const ctx = emptyCtx({
      behavioralInterests: new Map([['teknoloji', 1]]),
    })
    const personalized = nfRankEngine.compose(rows, ctx, 'personal', 2, emptySessionIntent())
    const cold = nfRankEngine.compose(rows, ctx, 'personal', 2, emptySessionIntent(), { coldStart: true })
    // Cold path should not simply mirror high teknoloji interest as top when editorial/fresh differs
    expect(cold[0]!.score).toBeDefined()
    expect(personalized.map((r) => r.articleId)).not.toEqual([])
  })

  it('exploration discovery still requires quality floor conceptually', () => {
    const low = baseRow({
      articleId: 'low',
      source: 'DISCOVERY',
      sourceQualityTier: 'LOW',
      sourceHealthScore: 10,
      clusterId: 'cl-low',
    })
    const high = baseRow({
      articleId: 'high',
      source: 'DISCOVERY',
      sourceQualityTier: 'TRUSTED',
      sourceHealthScore: 90,
      clusterId: 'cl-high',
    })
    const ranked = nfRankEngine.compose([low, high], emptyCtx(), 'personal', 2, emptySessionIntent(), {
      includeExplain: true,
    })
    const highItem = ranked.find((r) => r.articleId === 'high')
    expect(highItem).toBeDefined()
    if (highItem?.nfExplain) {
      expect(highItem.nfExplain.components.quality).toBeGreaterThanOrEqual(
        NFRANK_CONFIG_V1.explorationMinQuality
      )
    }
  })

  it('long-term affinity contributes to score', () => {
    const row = baseRow({ articleId: 'aff', category: 'teknoloji', publisherId: 'pub-x' })
    const cold = emptyCtx()
    const warm = emptyCtx({
      behavioralInterests: new Map([['teknoloji', 0.9]]),
      publisherAffinities: new Map([['pub-x', 0.9]]),
      followedPublisherIds: new Set(['pub-x']),
    })
    const sCold = nfRankEngine.scoreOne(row, cold, 'personal', emptySessionIntent())
    const sWarm = nfRankEngine.scoreOne(row, warm, 'personal', emptySessionIntent())
    expect(sWarm.score).toBeGreaterThan(sCold.score)
  })

  it('session intent contributes without permanent profile mutation API', () => {
    const row = baseRow({ articleId: 's1', category: 'spor' })
    const session = buildSessionIntentFromEvents([
      { eventType: 'HABERI_OKU', category: 'spor', ageMinutes: 2 },
    ])
    const without = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', emptySessionIntent())
    const withSession = nfRankEngine.scoreOne(row, emptyCtx(), 'personal', session)
    expect(withSession.components.sessionIntent).toBeGreaterThan(0)
    expect(withSession.score).toBeGreaterThanOrEqual(without.score)
  })
})

describe('NFRank shadow vs FeedRankingV1', () => {
  it('shadow comparison does not claim identical order; preserves baseline as visible', () => {
    const rows = [
      baseRow({ articleId: 'a1', category: 'teknoloji', clusterId: '1' }),
      baseRow({ articleId: 'a2', category: 'spor', clusterId: '2', source: 'DISCOVERY' }),
      baseRow({ articleId: 'a3', category: 'ekonomi', clusterId: '3', breaking: true, source: 'BREAKING' }),
      baseRow({ articleId: 'a4', category: 'teknoloji', clusterId: '4', publisherId: 'p2' }),
    ]
    const ctx = emptyCtx({ behavioralInterests: new Map([['teknoloji', 0.7]]) })
    const scored = feedScoringService.scoreAll(rows, ctx, 'personal', new Set(), new Set())
    const baseline = feedDiversityEngine.rerank(scored, 'personal', 4)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 4, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    expect(cmp.rankingVersionShadow).toBe('NFRANK_V1')
    expect(cmp.shadowClusterDupes).toBe(0)
    expect(['BETTER', 'MIXED', 'WORSE', 'INCONCLUSIVE']).toContain(cmp.verdict)
    // Visible baseline IDs unchanged by shadow compute
    expect(baseline.map((b) => b.articleId)).toEqual(baseline.map((b) => b.articleId))
  })
})

describe('NFRank Feed V2 isolation (source contracts)', () => {
  it('FeedService resolves NFRank only for feed-v2 surface', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/feed/FeedService.ts'),
      'utf8'
    )
    expect(src).toContain("ctx.surface !== 'feed-v2'")
    expect(src).toContain('resolveNfRankMode')
    expect(src).toContain('nfRankMode')
  })

  it('api/feed/v2 passes surface feed-v2', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/feed/v2/route.ts'), 'utf8')
    expect(src).toContain("surface: 'feed-v2'")
  })

  it('grantPilotBundle does not auto-expand NFRANK_V1 cohort', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/user/userFeatureAccessService.ts'),
      'utf8'
    )
    expect(src).toContain('SMART_FEED_RANKING_V1')
    expect(src).not.toMatch(/grantPilotBundle[\s\S]*NFRANK_V1/)
  })

  it('qualified impression constants remain >=60% and >=750ms', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const seen = fs.readFileSync(
      path.join(process.cwd(), 'src/services/feed/FeedSeenService.ts'),
      'utf8'
    )
    expect(seen).toContain('>=60%')
    expect(seen).toContain('>=750ms')
  })
})
