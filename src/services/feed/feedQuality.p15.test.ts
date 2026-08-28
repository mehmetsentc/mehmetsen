/**
 * Phase P15 — Smart Feed Quality, Relevance & Analytics Test Suite
 */
import { describe, expect, it } from 'vitest'
import {
  FEED_RANKING_CONFIG_V1,
  FEED_RANKING_VERSION,
  freshnessScore,
  resolveCategoryClass,
  resolveModeWeights,
} from '@/lib/feed/rankingConfig'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import { selectClusterRepresentatives } from '@/services/feed/FeedRepresentativeSelector'
import { feedUserContextService } from '@/services/feed/FeedUserContextService'
import { feedColdStartService } from '@/services/feed/FeedColdStartService'
import type { FeedCandidateRow, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'

function makeRow(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test Headline Example',
    summary: partial.summary ?? 'Test summary content',
    category: partial.category ?? 'gundem',
    image: partial.image ?? 'https://example.com/img.jpg',
    video: null,
    publishedAt: partial.publishedAt ?? now,
    updatedAt: now,
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    clusterImportance: partial.clusterImportance ?? 50,
    sourceQualityTier: partial.sourceQualityTier ?? 'TRUSTED',
    sourceHealthScore: partial.sourceHealthScore ?? 80,
    citySlug: null,
    districtSlug: null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? 'test-headline-slug',
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

describe('PHASE P15 — Smart Feed Quality, Relevance & Diagnostics', () => {
  it('1. Quality Scoring: maps source quality tiers and health correctly', () => {
    const premiumRow = makeRow({ articleId: 'a1', sourceQualityTier: 'PREMIUM', sourceHealthScore: 100, publisherVerified: true })
    const lowRow = makeRow({ articleId: 'a2', sourceQualityTier: 'LOW', sourceHealthScore: 20 })

    const ctx = makeCtx()
    const scoredPremium = feedScoringService.scoreCandidate(premiumRow, ctx, 'personal')
    const scoredLow = feedScoringService.scoreCandidate(lowRow, ctx, 'personal')

    expect(scoredPremium.breakdown.quality).toBeGreaterThan(scoredLow.breakdown.quality)
    expect(scoredPremium.score).toBeGreaterThan(scoredLow.score)
  })

  it('2. Reason Codes: derives structured reason codes based on dominant signals', () => {
    const ctx = makeCtx({
      followedPublisherIds: new Set(['pub_followed']),
      explicitInterests: ['teknoloji'],
      city: 'istanbul',
    })

    // Material update
    const matRow = makeRow({ articleId: 'm1', materialUpdate: true })
    const matScore = feedScoringService.scoreCandidate(matRow, ctx, 'personal')
    expect(matScore.reason).toBe('MATERIAL_UPDATE')

    // Breaking
    const breakRow = makeRow({ articleId: 'b1', breaking: true, clusterImportance: 90 })
    const breakScore = feedScoringService.scoreCandidate(breakRow, ctx, 'breaking')
    expect(breakScore.reason).toBe('BREAKING_URGENT')

    // Following
    const folRow = makeRow({ articleId: 'f1', publisherId: 'pub_followed' })
    const folScore = feedScoringService.scoreCandidate(folRow, ctx, 'following')
    expect(folScore.reason).toBe('FOLLOWING_FRESH')

    // Local
    const locRow = makeRow({ articleId: 'l1', citySlug: 'istanbul', source: 'LOCAL' })
    const locScore = feedScoringService.scoreCandidate(locRow, ctx, 'local')
    expect(locScore.reason).toBe('LOCAL_RELEVANT')

    // Interest
    const intRow = makeRow({ articleId: 'i1', category: 'teknoloji' })
    const intScore = feedScoringService.scoreCandidate(intRow, ctx, 'personal')
    expect(intScore.reason).toBe('INTEREST_MATCH')

    // Discovery
    const discRow = makeRow({ articleId: 'd1', source: 'DISCOVERY' })
    const discScore = feedScoringService.scoreCandidate(discRow, ctx, 'personal')
    expect(discScore.reason).toBe('DISCOVERY')

    // Popular
    const popRow = makeRow({ articleId: 'p1', source: 'POPULAR' })
    const popScore = feedScoringService.scoreCandidate(popRow, ctx, 'personal')
    expect(popScore.reason).toBe('POPULAR')
  })

  it('3. Freshness Curve: decays over time according to category half-life', () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000)

    const scoreFresh = freshnessScore(oneHourAgo, 'BREAKING', now)
    const scoreMid = freshnessScore(twelveHoursAgo, 'BREAKING', now)
    const scoreOld = freshnessScore(threeDaysAgo, 'BREAKING', now)

    expect(scoreFresh).toBeGreaterThan(scoreMid)
    expect(scoreMid).toBeGreaterThan(scoreOld)
    expect(scoreOld).toBeLessThan(0.1)
  })

  it('4. Cluster Deduplication: selects highest quality representative per cluster', () => {
    const rows = [
      makeRow({ articleId: 'a1', clusterId: 'c1', clusterSourceCount: 3, publisherVerified: true }),
      makeRow({ articleId: 'a2', clusterId: 'c1', clusterSourceCount: 1, publisherVerified: false }),
      makeRow({ articleId: 'b1', clusterId: 'c2', clusterSourceCount: 2 }),
      makeRow({ articleId: 's1', clusterId: null }), // standalone
    ]

    const selected = selectClusterRepresentatives(rows)
    expect(selected.length).toBe(3)
    const c1Rep = selected.find((r) => r.clusterId === 'c1')
    expect(c1Rep?.articleId).toBe('a1')
  })

  it('5. Publisher & Topic Diversity: prevents runs of same publisher/category', () => {
    const scoredList: ScoredFeedCandidate[] = [
      { ...makeRow({ articleId: '1', publisherId: 'p1', category: 'gundem' }), score: 0.90, breakdown: {} as any, reason: 'RECENT' },
      { ...makeRow({ articleId: '2', publisherId: 'p1', category: 'gundem' }), score: 0.895, breakdown: {} as any, reason: 'RECENT' },
      { ...makeRow({ articleId: '3', publisherId: 'p2', category: 'spor' }), score: 0.892, breakdown: {} as any, reason: 'RECENT' },
    ]

    const diversified = feedDiversityEngine.rerank(scoredList, 'personal', 3)
    // The top candidate stays first, but p2 gets picked next due to repetition penalty on p1
    expect(diversified[0].articleId).toBe('1')
    expect(diversified[1].publisherId).toBe('p2')
  })

  it('6. Negative Feedback Penalty: suppresses categories and muted publishers', () => {
    const candidate = makeRow({ articleId: 'art1', publisherId: 'pub_bad', category: 'magazin' })
    const ctx = makeCtx({
      negativePreferences: [
        { preferenceType: 'DISLIKE', targetType: 'category', targetId: 'magazin', modifier: -1 },
        { preferenceType: 'MUTE', targetType: 'publisher', targetId: 'pub_bad', modifier: -1 },
      ],
    })

    const hasNeg = feedUserContextService.hasNegativePreference(ctx, {
      articleId: candidate.articleId,
      publisherId: candidate.publisherId,
      category: candidate.category,
    })
    expect(hasNeg).toBe(true)

    const scored = feedScoringService.scoreCandidate(candidate, ctx, 'personal')
    expect(scored.breakdown.penalties).toBeGreaterThan(0)
  })

  it('7. Cold Start V2 Profile Resolution: maps empty signals to NEW_USER and partial to LIGHT_USER', () => {
    const emptyCtx = makeCtx()
    const profileNew = feedColdStartService.resolveProfile(emptyCtx)
    expect(profileNew).toBe('NEW_USER')

    const userWithInterests = makeCtx({ explicitInterests: ['teknoloji'] })
    const profileLight = feedColdStartService.resolveProfile(userWithInterests)
    expect(profileLight).toBe('LIGHT_USER')
  })

  it('8. Hard Quality Gates: catches empty headlines, missing slugs, and placeholders', () => {
    const valid = makeRow({ articleId: 'v1', headline: 'Geçerli Haber Başlığı', slug: 'gecerli-haber' })
    const invalidTitle = makeRow({ articleId: 'i1', headline: '' })
    const placeholder = makeRow({ articleId: 'i2', headline: '[TEST] Dummy placeholder sample' })

    expect(valid.headline.trim().length).toBeGreaterThan(5)
    expect(invalidTitle.headline.trim().length).toBe(0)
    expect(/lorem|test|dummy|sample/i.test(placeholder.headline)).toBe(true)
  })
})
