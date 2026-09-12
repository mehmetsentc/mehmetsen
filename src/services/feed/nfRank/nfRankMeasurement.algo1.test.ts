/**
 * ALGO-1 — NFRank shadow measurement foundation.
 * Visible ranking must stay unchanged. No live activation. No grants. No synthetic engagement.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FeedCandidateRow, FeedUserContext } from '@/types/smartFeed'
import { FEED_IMPRESSION_CONFIG } from '@/lib/feed/config'
import { isNfRankLiveEnabled, isNfRankShadowEnabled } from '@/lib/feed/featureFlag'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import { emptySessionIntent, nfRankEngine } from '@/services/feed/nfRank/NFRankEngine'
import {
  NFRANK_SHADOW_ITEM_CAP,
  compareShadowRankings,
  toNfShadowTelemetryMetadata,
  withShownPositions,
} from '@/services/feed/nfRank/nfRankShadowCompare'

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
    tags: partial.tags,
  }
}

function emptyCtx(partial?: Partial<FeedUserContext>): FeedUserContext {
  return {
    userId: 'wG8WTNlW38TILLvpDLsFmt8IMlg1',
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

function visibleOrder(rows: FeedCandidateRow[], ctx: FeedUserContext) {
  const scored = feedScoringService.scoreAll(rows, ctx, 'personal', new Set(), new Set())
  return feedDiversityEngine.rerank(scored, 'personal', rows.length)
}

describe('ALGO-1 flags + safety contracts', () => {
  const prevLive = process.env.FEED_V2_NFRANK_ENABLED
  const prevShadow = process.env.FEED_V2_NFRANK_SHADOW_ENABLED

  afterEach(() => {
    if (prevLive === undefined) delete process.env.FEED_V2_NFRANK_ENABLED
    else process.env.FEED_V2_NFRANK_ENABLED = prevLive
    if (prevShadow === undefined) delete process.env.FEED_V2_NFRANK_SHADOW_ENABLED
    else process.env.FEED_V2_NFRANK_SHADOW_ENABLED = prevShadow
  })

  it('1. NFRank live remains OFF by default', () => {
    delete process.env.FEED_V2_NFRANK_ENABLED
    expect(isNfRankLiveEnabled()).toBe(false)
  })

  it('shadow infrastructure remains ON by default', () => {
    delete process.env.FEED_V2_NFRANK_SHADOW_ENABLED
    expect(isNfRankShadowEnabled()).toBe(true)
  })

  it('14. grantPilotBundle still does not include NFRANK_V1', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/user/userFeatureAccessService.ts'), 'utf8')
    expect(src).not.toMatch(/grantPilotBundle[\s\S]*NFRANK_V1/)
  })

  it('9. qualified impression semantics remain >=60% and >=750ms', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBe(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBe(750)
  })

  it('10. impression timer-reset code is not modified by ALGO-1', () => {
    const seen = readFileSync(join(process.cwd(), 'src/services/feed/FeedSeenService.ts'), 'utf8')
    expect(seen).toContain('lastSeenAt')
    expect(seen).toContain('recordImpressions')
  })

  it('11. negative feedback remains auth-protected', () => {
    const feedback = readFileSync(join(process.cwd(), 'src/app/api/feed/feedback/route.ts'), 'utf8')
    expect(feedback).toContain('requireSocialUser')
    expect(feedback).toContain("status: 401")
  })

  it('12. telemetry route does not accept client nfrank_shadow (no gate broadening)', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/feed/telemetry/route.ts'), 'utf8')
    expect(route).toContain("e?.eventType !== 'nfrank_shadow'")
    expect(route).toContain('isSmartFeedEffectiveForUser')
  })

  it('13. measurement does not create synthetic engagement writers', () => {
    const telemetry = readFileSync(join(process.cwd(), 'src/services/feed/FeedTelemetryService.ts'), 'utf8')
    expect(telemetry).toContain('recordNfRankShadow')
    expect(telemetry).not.toMatch(/recordNfRankShadow[\s\S]*article_liked/)
    expect(telemetry).not.toMatch(/recordNfRankShadow[\s\S]*feed_impression/)
  })

  it('15. material update remains distinct from breaking in measurement fields', () => {
    const rows = [
      baseRow({ articleId: 'mu1', materialUpdate: true, breaking: false, clusterId: 'cl-mu' }),
      baseRow({ articleId: 'br1', materialUpdate: false, breaking: true, source: 'BREAKING' }),
    ]
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 2, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    const mu = cmp.items.find((i) => i.id === 'mu1')
    const br = cmp.items.find((i) => i.id === 'br1')
    expect(mu?.mu).toBe(true)
    expect(mu?.brk).toBe(false)
    expect(br?.brk).toBe(true)
    expect(br?.mu).toBe(false)
  })

  it('cold-start still returns before rankWindow (shadow not auto-enabled)', () => {
    const pipeline = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedRankingPipeline.ts'),
      'utf8'
    )
    expect(pipeline).toContain('return feedColdStartService.buildFeed')
    expect(pipeline).toContain("if (nfMode === 'live')")
  })
})

describe('ALGO-1 ranking invariance', () => {
  it('3+4+5. V1 visible order is unchanged by comparison + shown overlay', () => {
    const rows = [
      baseRow({ articleId: 'a1', category: 'teknoloji', clusterId: '1', source: 'FEATURED' }),
      baseRow({ articleId: 'a2', category: 'spor', clusterId: '2', source: 'DISCOVERY' }),
      baseRow({ articleId: 'a3', category: 'ekonomi', clusterId: '3', breaking: true, source: 'BREAKING' }),
      baseRow({ articleId: 'a4', category: 'teknoloji', clusterId: '4', publisherId: 'p2' }),
      baseRow({ articleId: 'a5', category: 'yerel-haber', clusterId: null, source: 'LOCAL' }),
    ]
    const ctx = emptyCtx({ behavioralInterests: new Map([['teknoloji', 0.7]]) })
    const before = visibleOrder(rows, ctx).map((r) => r.articleId)
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 5, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    const afterOverlay = withShownPositions(cmp.items, baseline.slice(0, 3))
    const after = visibleOrder(rows, ctx).map((r) => r.articleId)
    expect(after).toEqual(before)
    expect(baseline.map((r) => r.articleId)).toEqual(before)
    expect(afterOverlay.map((i) => i.id).slice(0, 3)).toEqual(before.slice(0, 3))
  })

  it('shadow compose does not mutate the baseline array', () => {
    const rows = [
      baseRow({ articleId: 'x1' }),
      baseRow({ articleId: 'x2', source: 'POPULAR' }),
    ]
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const snapshot = baseline.map((r) => r.articleId)
    nfRankEngine.compose(rows, ctx, 'personal', 2, emptySessionIntent())
    compareShadowRankings({
      baseline,
      shadow: nfRankEngine.compose(rows, ctx, 'personal', 2, emptySessionIntent()),
      baselineVersion: 'v1',
    })
    expect(baseline.map((r) => r.articleId)).toEqual(snapshot)
  })
})

describe('ALGO-1 measurement contract + correlation', () => {
  it('6. baseline/shadow/shown positions correlate on article identity', () => {
    const rows = [
      baseRow({ articleId: 'a1', clusterId: 'c1' }),
      baseRow({ articleId: 'a2', clusterId: 'c2', source: 'POPULAR' }),
      baseRow({ articleId: 'a3', clusterId: null, source: 'FEATURED' }),
    ]
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 3, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    const shown = baseline.slice(0, 2)
    const meta = toNfShadowTelemetryMetadata({
      comparison: cmp,
      shown,
      feedSessionId: 'sess-rank-1',
      feedSurface: 'feed-v2',
    })
    const items = meta.items as Array<{ id: string; bp: number | null; sp: number | null; sh: number | null }>
    expect(meta.nf_rank_mode).toBe('shadow')
    expect(meta.feedSessionId).toBe('sess-rank-1')
    expect(meta.ranking_version_baseline).toBe('v1')
    expect(meta.ranking_version_shadow).toBe('NFRANK_V1')
    const shown0 = items.find((i) => i.id === shown[0]!.articleId)
    expect(shown0?.sh).toBe(1)
    expect(shown0?.bp).toBe(baseline.findIndex((r) => r.articleId === shown[0]!.articleId) + 1)
    const shadowFirst = items.find((i) => i.id === shadow[0]!.articleId)
    expect(shadowFirst?.sp).toBe(1)
    expect(JSON.stringify(meta)).not.toMatch(/Headline/)
  })

  it('7. feedSessionId + article id + client sessionId keys exist on the payload path', () => {
    const telemetry = readFileSync(join(process.cwd(), 'src/services/feed/FeedTelemetryService.ts'), 'utf8')
    expect(telemetry).toContain('sessionId')
    expect(telemetry).toContain('feedSessionId')
    const feed = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
    expect(feed).toContain('persistNfRankShadowMeasurement')
    expect(feed).toContain('pipelineResult.session.sessionId')
    expect(feed).toContain('ctx.sessionId')
  })

  it('records absence of clusterId instead of inventing one', () => {
    const rows = [baseRow({ articleId: 'n1', clusterId: null })]
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 1, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    expect(cmp.items[0]?.cid).toBeNull()
  })

  it('caps items so persistence is one bounded batch, not N+1 per candidate', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      baseRow({ articleId: `i${i}`, clusterId: `cl-${i}` })
    )
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 40, emptySessionIntent())
    const cmp = compareShadowRankings({ baseline, shadow, baselineVersion: 'v1' })
    expect(cmp.items.length).toBeLessThanOrEqual(NFRANK_SHADOW_ITEM_CAP)
  })
})

describe('ALGO-1 telemetry gate', () => {
  const prevTel = process.env.SMART_FEED_TELEMETRY_ENABLED

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (prevTel === undefined) delete process.env.SMART_FEED_TELEMETRY_ENABLED
    else process.env.SMART_FEED_TELEMETRY_ENABLED = prevTel
    vi.restoreAllMocks()
  })

  it('8. existing telemetry gate still wraps nfrank_shadow (no bypass)', async () => {
    process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'
    const recorded: unknown[] = []
    vi.doMock('@/lib/social/events', () => ({
      recordSocialEvent: vi.fn(async (ev: unknown) => {
        recorded.push(ev)
      }),
    }))
    const { FeedTelemetryService } = await import('@/services/feed/FeedTelemetryService')
    const { compareShadowRankings: cmpFn } = await import('@/services/feed/nfRank/nfRankShadowCompare')
    const rows = [baseRow({ articleId: 'g1' })]
    const ctx = emptyCtx()
    const baseline = visibleOrder(rows, ctx)
    const shadow = nfRankEngine.compose(rows, ctx, 'personal', 1, emptySessionIntent())
    const comparison = cmpFn({ baseline, shadow, baselineVersion: 'v1' })
    const svc = new FeedTelemetryService()
    await svc.recordNfRankShadow({
      userId: null,
      sessionId: 'client-session',
      feedType: 'personal',
      feedSurface: 'feed-v2',
      feedSessionId: 'rank-session',
      comparison,
      shown: baseline,
    })
    expect(recorded).toHaveLength(0)
  })
})
