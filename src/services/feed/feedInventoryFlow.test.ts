import { describe, expect, it } from 'vitest'
import { feedScoringService } from './FeedScoringService'
import { feedDiversityEngine } from './FeedDiversityEngine'
import { feedRepresentativeSelector } from './FeedRepresentativeSelector'
import { feedSessionService } from './FeedSessionService'
import { feedColdStartService } from './FeedColdStartService'
import { resolveCategoryClass, freshnessScore } from '@/lib/feed/rankingConfig'
import type { FeedCandidateRow, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'

function makeCandidate(partial: Partial<FeedCandidateRow> = {}): FeedCandidateRow {
  const now = new Date()
  return {
    articleId: partial.articleId || `art_${Math.random().toString(36).slice(2, 9)}`,
    clusterId: partial.clusterId ?? null,
    publisherId: partial.publisherId ?? 'pub_1',
    publisherSlug: partial.publisherSlug ?? 'pub-1',
    publisherName: partial.publisherName ?? 'Kaynak 1',
    publisherLogoUrl: null,
    publisherVerified: partial.publisherVerified ?? false,
    headline: partial.headline || 'Test Haber Başlığı',
    summary: 'Test özet metni',
    category: partial.category || 'gundem',
    image: 'https://images.unsplash.com/photo-test',
    video: null,
    publishedAt: partial.publishedAt || now,
    updatedAt: now,
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    clusterImportance: partial.clusterImportance ?? 50,
    sourceQualityTier: partial.sourceQualityTier || 'STANDARD',
    sourceHealthScore: partial.sourceHealthScore ?? 75,
    citySlug: partial.citySlug ?? null,
    districtSlug: partial.districtSlug ?? null,
    likesCount: partial.likesCount ?? 10,
    commentsCount: partial.commentsCount ?? 5,
    savesCount: partial.savesCount ?? 2,
    sharesCount: partial.sharesCount ?? 1,
    viewsCount: partial.viewsCount ?? 100,
    slug: partial.slug || 'test-haber-slug',
    source: partial.source || 'RECENT',
    sortScore: partial.sortScore ?? now.getTime(),
  }
}

function makeUserCtx(partial: Partial<FeedUserContext> = {}): FeedUserContext {
  return {
    userId: 'user_1',
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

describe('Feed Inventory Flow & Ranking Algorithm Verification', () => {
  it('1. Category Class Resolution: accurately maps all main editorial categories', () => {
    expect(resolveCategoryClass('gundem', false)).toBe('BREAKING')
    expect(resolveCategoryClass('son-dakika', false)).toBe('BREAKING')
    expect(resolveCategoryClass('dunya', false)).toBe('BREAKING')
    expect(resolveCategoryClass('spor', false)).toBe('SPORT')
    expect(resolveCategoryClass('futbol', false)).toBe('SPORT')
    expect(resolveCategoryClass('basketbol', false)).toBe('SPORT')
    expect(resolveCategoryClass('ekonomi', false)).toBe('ANALYSIS')
    expect(resolveCategoryClass('finans', false)).toBe('ANALYSIS')
    expect(resolveCategoryClass('teknoloji', false)).toBe('ANALYSIS')
    expect(resolveCategoryClass('kultur', false)).toBe('CULTURE')
    expect(resolveCategoryClass('magazin', false)).toBe('CULTURE')
    expect(resolveCategoryClass('yasam', false)).toBe('CULTURE')
    expect(resolveCategoryClass('saglik', false)).toBe('CULTURE')
  })

  it('2. Freshness Decay: applies half-life decay appropriately per category', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000)
    const twelveHoursAgo = new Date(now.getTime() - 12 * 3600 * 1000)

    const freshBreaking = freshnessScore(twoHoursAgo, 'BREAKING', now)
    const oldBreaking = freshnessScore(twelveHoursAgo, 'BREAKING', now)
    expect(freshBreaking).toBeGreaterThan(oldBreaking)

    const analysisFresh = freshnessScore(twelveHoursAgo, 'ANALYSIS', now)
    expect(analysisFresh).toBeGreaterThan(oldBreaking)
  })

  it('3. Multi-Factor Candidate Scoring: ranks premium tier, breaking, and interest matched items higher', () => {
    const ctx = makeUserCtx({
      explicitInterests: ['teknoloji'],
      followedPublisherIds: new Set(['pub_tech']),
    })

    const standardRow = makeCandidate({
      articleId: 'art_std',
      category: 'genel',
      sourceQualityTier: 'STANDARD',
    })

    const techFollowedRow = makeCandidate({
      articleId: 'art_tech',
      category: 'teknoloji',
      publisherId: 'pub_tech',
      sourceQualityTier: 'PREMIUM',
      publisherVerified: true,
    })

    const scored = feedScoringService.scoreAll([standardRow, techFollowedRow], ctx, 'personal', new Set(), new Set())
    expect(scored[0].articleId).toBe('art_tech')
    expect(scored[0].score).toBeGreaterThan(scored[1].score)
  })

  it('4. Diversity Enforcement: prevents 3 consecutive cards from the same category or publisher', () => {
    const scoredList: ScoredFeedCandidate[] = [
      {
        ...makeCandidate({ articleId: 'g1', category: 'gundem', publisherId: 'pub_1' }),
        score: 0.95,
        reason: 'RECENT',
        breakdown: { following: 0, freshness: 0.9, interest: 0.8, local: 0, editorial: 0.8, quality: 0.8, engagement: 0.8, discovery: 0.1, featured: 0, popularity: 0, materialUpdate: 0, penalties: 0, total: 0.95 },
      },
      {
        ...makeCandidate({ articleId: 'g2', category: 'gundem', publisherId: 'pub_2' }),
        score: 0.94,
        reason: 'RECENT',
        breakdown: { following: 0, freshness: 0.9, interest: 0.8, local: 0, editorial: 0.8, quality: 0.8, engagement: 0.8, discovery: 0.1, featured: 0, popularity: 0, materialUpdate: 0, penalties: 0, total: 0.94 },
      },
      {
        ...makeCandidate({ articleId: 'g3', category: 'gundem', publisherId: 'pub_3' }),
        score: 0.93,
        reason: 'RECENT',
        breakdown: { following: 0, freshness: 0.9, interest: 0.8, local: 0, editorial: 0.8, quality: 0.8, engagement: 0.8, discovery: 0.1, featured: 0, popularity: 0, materialUpdate: 0, penalties: 0, total: 0.93 },
      },
      {
        ...makeCandidate({ articleId: 's1', category: 'spor', publisherId: 'pub_b' }),
        score: 0.85,
        reason: 'RECENT',
        breakdown: { following: 0, freshness: 0.8, interest: 0.7, local: 0, editorial: 0.7, quality: 0.8, engagement: 0.7, discovery: 0.1, featured: 0, popularity: 0, materialUpdate: 0, penalties: 0, total: 0.85 },
      },
      {
        ...makeCandidate({ articleId: 'e1', category: 'ekonomi', publisherId: 'pub_c' }),
        score: 0.80,
        reason: 'RECENT',
        breakdown: { following: 0, freshness: 0.8, interest: 0.6, local: 0, editorial: 0.6, quality: 0.8, engagement: 0.6, discovery: 0.1, featured: 0, popularity: 0, materialUpdate: 0, penalties: 0, total: 0.80 },
      },
    ]

    const reranked = feedDiversityEngine.rerank(scoredList, 'personal', 5)
    expect(reranked).toHaveLength(5)
    // Verify diversity: categories are interleaved and there are never 3 consecutive identical categories
    for (let i = 2; i < reranked.length; i++) {
      const c0 = (reranked[i].category ?? '').toLowerCase()
      const c1 = (reranked[i - 1].category ?? '').toLowerCase()
      const c2 = (reranked[i - 2].category ?? '').toLowerCase()
      expect(c0 === c1 && c1 === c2).toBe(false)
    }
  })

  it('5. Representative Selection: cluster dedup keeps best quality article per cluster', () => {
    const reps = feedRepresentativeSelector.select([
      makeCandidate({ articleId: 'low_1', clusterId: 'clust_1', sourceQualityTier: 'LOW', clusterImportance: 40 }),
      makeCandidate({ articleId: 'prem_1', clusterId: 'clust_1', sourceQualityTier: 'PREMIUM', publisherVerified: true, clusterImportance: 80 }),
      makeCandidate({ articleId: 'std_2', clusterId: 'clust_2', sourceQualityTier: 'STANDARD' }),
    ])

    expect(reps).toHaveLength(2)
    const c1 = reps.find((r) => r.clusterId === 'clust_1')
    expect(c1?.articleId).toBe('prem_1')
  })

  it('6. Session Stability: signed cursor maintains order and paginates smoothly', () => {
    const ids = ['art_1', 'art_2', 'art_3', 'art_4', 'art_5', 'art_6']
    const session = feedSessionService.create('personal', ids)
    const token = feedSessionService.encode(session)

    const decoded = feedSessionService.decode(token)
    expect(decoded).not.null
    expect(decoded?.rankedIds).toEqual(ids)

    const p1 = feedSessionService.slicePage(session, 3)
    expect(p1.ids).toEqual(['art_1', 'art_2', 'art_3'])
    expect(p1.hasMoreInSnapshot).toBe(true)

    const p2 = feedSessionService.slicePage(p1.nextPayload, 3)
    expect(p2.ids).toEqual(['art_4', 'art_5', 'art_6'])
    expect(p2.hasMoreInSnapshot).toBe(false)
  })

  it('7. Cold Start Profile Resolution: handles guest vs new user vs light user', () => {
    const guestCtx = makeUserCtx({ userId: null })
    expect(feedColdStartService.resolveProfile(guestCtx)).toBe('GUEST')

    const newCtx = makeUserCtx({ userId: 'u_new', explicitInterests: [] })
    expect(feedColdStartService.resolveProfile(newCtx)).toBe('NEW_USER')

    const lightCtx = makeUserCtx({ userId: 'u_light', explicitInterests: ['spor'] })
    expect(feedColdStartService.resolveProfile(lightCtx)).toBe('LIGHT_USER')
  })
})
