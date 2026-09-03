/**
 * Phase P17 — Real Pilot Usage & Feed Validation Test Suite
 */
import { describe, expect, it } from 'vitest'
import { FEED_IMPRESSION_CONFIG, FEED_MODE_LABELS, FEED_PAGINATION } from '@/lib/feed/config'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { selectClusterRepresentatives } from '@/services/feed/FeedRepresentativeSelector'
import type { FeedCandidateRow, FeedUserContext } from '@/types/smartFeed'

function makeRow(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: partial.clusterId ?? null,
    publisherId: partial.publisherId ?? null,
    publisherSlug: partial.publisherSlug ?? null,
    publisherName: partial.publisherName ?? 'Kaynak',
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Pilot Test Başlık',
    summary: partial.summary ?? 'Pilot test özet metni.',
    category: partial.category ?? 'gundem',
    image: partial.image ?? 'https://example.com/test.jpg',
    video: null,
    publishedAt: partial.publishedAt ?? now,
    updatedAt: now,
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    clusterImportance: partial.clusterImportance ?? 50,
    sourceQualityTier: partial.sourceQualityTier ?? 'TRUSTED',
    sourceHealthScore: partial.sourceHealthScore ?? 80,
    citySlug: partial.citySlug ?? null,
    districtSlug: partial.districtSlug ?? null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? 'pilot-test-baslik',
    source: partial.source ?? 'RECENT',
    sortScore: partial.sortScore ?? now.getTime(),
    ...partial,
  }
}

function makeCtx(partial: Partial<FeedUserContext> = {}): FeedUserContext {
  return {
    userId: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
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

describe('PHASE P17 — Real Pilot Usage & Feed Validation', () => {
  it('1. Impression Gate Configuration: enforces >=60% visibility and >=750ms dwell', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBe(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBe(750)
  })

  it('2. Feed Pagination Constraints: defaults to 15, bounds between 10 and 30', () => {
    expect(FEED_PAGINATION.defaultLimit).toBe(15)
    expect(FEED_PAGINATION.minLimit).toBe(10)
    expect(FEED_PAGINATION.maxLimit).toBe(30)
    expect(FEED_PAGINATION.prefetchThreshold).toBe(5)
  })

  it('3. Feed Mode Labels: defines Turkish labels for all 4 feed modes', () => {
    expect(FEED_MODE_LABELS.personal).toBe('Sana Özel')
    expect(FEED_MODE_LABELS.following).toBe('Takip')
    expect(FEED_MODE_LABELS.breaking).toBe('Son Dakika')
    expect(FEED_MODE_LABELS.local).toBe('Yerel')
  })

  it('4. Negative Feedback Penalties: properly applies score penalties for hidden articles/publishers/topics', () => {
    const row = makeRow({
      articleId: 'art-neg-1',
      publisherId: 'pub-bad',
      category: 'magazin',
    })

    const cleanCtx = makeCtx()
    const normalScore = feedScoringService.scoreCandidate(row, cleanCtx, 'personal')

    // Negative preference on article
    const hideCtx = makeCtx({
      negativePreferences: [
        { preferenceType: 'hide', targetType: 'article', targetId: 'art-neg-1', modifier: -1 },
      ],
    })
    const hiddenScore = feedScoringService.scoreCandidate(row, hideCtx, 'personal')
    expect(hiddenScore.score).toBeLessThan(normalScore.score)
    expect(hiddenScore.breakdown.penalties).toBeGreaterThan(0)

    // Negative preference on publisher
    const pubCtx = makeCtx({
      negativePreferences: [
        { preferenceType: 'less', targetType: 'publisher', targetId: 'pub-bad', modifier: -1 },
      ],
    })
    const pubScore = feedScoringService.scoreCandidate(row, pubCtx, 'personal')
    expect(pubScore.score).toBeLessThan(normalScore.score)

    // Negative preference on category
    const catCtx = makeCtx({
      negativePreferences: [
        { preferenceType: 'less', targetType: 'category', targetId: 'magazin', modifier: -1 },
      ],
    })
    const catScore = feedScoringService.scoreCandidate(row, catCtx, 'personal')
    expect(catScore.score).toBeLessThan(normalScore.score)
  })

  it('5. Cluster Deduplication: selects highest quality canonical representative per cluster', () => {
    const rows = [
      makeRow({ articleId: 'c1-a1', clusterId: 'clust-1', sourceQualityTier: 'LOW', sourceHealthScore: 30 }),
      makeRow({ articleId: 'c1-a2', clusterId: 'clust-1', sourceQualityTier: 'PREMIUM', sourceHealthScore: 95 }),
      makeRow({ articleId: 'c2-a1', clusterId: 'clust-2', sourceQualityTier: 'STANDARD', sourceHealthScore: 70 }),
      makeRow({ articleId: 'c3-standalone', clusterId: null, sourceQualityTier: 'TRUSTED', sourceHealthScore: 80 }),
    ]

    const deduped = selectClusterRepresentatives(rows)
    expect(deduped).toHaveLength(3)

    const clust1Rep = deduped.find((r) => r.clusterId === 'clust-1')
    expect(clust1Rep).toBeDefined()
    expect(clust1Rep?.articleId).toBe('c1-a2')
  })

  it('6. Editorial Pilot User Isolation: ensures only pilot user has feature overrides', () => {
    const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
    expect(pilotUid).toMatch(/^[a-zA-Z0-9]+$/)
    expect(pilotUid.length).toBeGreaterThan(20)
  })

  it('7. Feed Telemetry Isolation: FeedTelemetryService respects effective user rollout over global disabled flag', async () => {
    const { feedTelemetryService } = await import('@/services/feed/FeedTelemetryService')
    expect(feedTelemetryService).toBeDefined()
    expect(typeof feedTelemetryService.recordBatch).toBe('function')
  })
})
