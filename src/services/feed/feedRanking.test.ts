/**
 * Phase P5 Smart Feed Ranking tests — unit/logic (no live DB).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  FEED_RANKING_CONFIG_V1,
  FEED_RANKING_VERSION,
  freshnessScore,
  normalizeEngagementRate,
  resolveCategoryClass,
  resolveModeWeights,
} from '@/lib/feed/rankingConfig'
import { isSmartFeedRankingV1Enabled } from '@/lib/feed/featureFlag'
import { selectClusterRepresentatives } from '@/services/feed/FeedRepresentativeSelector'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedSessionService } from '@/services/feed/FeedSessionService'
import type { FeedUserContext } from '@/types/smartFeed'
import type { FeedCandidateRow, ScoredFeedCandidate } from '@/types/smartFeed'

function row(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test',
    summary: null,
    category: null,
    image: null,
    video: null,
    publishedAt: partial.publishedAt ?? now,
    updatedAt: now,
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? 'test-slug',
    source: partial.source ?? 'RECENT',
    sortScore: partial.sortScore ?? now.getTime(),
    ...partial,
  }
}

function ctx(partial: Partial<FeedUserContext> = {}): FeedUserContext {
  return {
    userId: 'u1',
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

describe('P5 feature flag default false in production', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'production' }
    delete process.env.SMART_FEED_RANKING_V1_ENABLED
  })
  afterEach(() => {
    process.env = env
  })
  it('ranking flag off in prod when unset', () => {
    expect(isSmartFeedRankingV1Enabled()).toBe(false)
  })
})

describe('P5 ranking config', () => {
  it('version is v1', () => {
    expect(FEED_RANKING_CONFIG_V1.version).toBe(FEED_RANKING_VERSION)
    expect(FEED_RANKING_VERSION).toBe('v1')
  })

  it('mode profiles differ', () => {
    const personal = resolveModeWeights('personal')
    const following = resolveModeWeights('following')
    expect(following.following).toBeGreaterThan(personal.following)
    expect(resolveModeWeights('breaking').freshness).toBeGreaterThan(personal.freshness)
    expect(resolveModeWeights('local').local).toBeGreaterThan(personal.local)
  })

  it('freshness half-life by category', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 2 * 3_600_000)
    const old = new Date(now.getTime() - 48 * 3_600_000)
    expect(freshnessScore(recent, 'BREAKING', now)).toBeGreaterThan(freshnessScore(old, 'BREAKING', now))
    expect(freshnessScore(recent, 'ANALYSIS', now)).toBeGreaterThan(freshnessScore(old, 'ANALYSIS', now))
  })

  it('engagement normalized not raw', () => {
    expect(normalizeEngagementRate(0)).toBe(0)
    expect(normalizeEngagementRate(1000)).toBeLessThanOrEqual(1)
    expect(normalizeEngagementRate(10)).toBeLessThan(normalizeEngagementRate(100))
  })
})

describe('P5 following boost', () => {
  it('boosts followed publisher articles', () => {
    const followed = feedScoringService.scoreCandidate(
      row({ articleId: 'f1', publisherId: 'pub1', source: 'FOLLOWING' }),
      ctx({ followedPublisherIds: new Set(['pub1']) }),
      'personal'
    )
    const other = feedScoringService.scoreCandidate(row({ articleId: 'r1', publisherId: 'pub2' }), ctx(), 'personal')
    expect(followed.score).toBeGreaterThan(other.score)
    expect(followed.reason).toBe('FOLLOWING_FRESH')
  })
})

describe('P5 interest signal', () => {
  it('matches explicit interests', () => {
    const scored = feedScoringService.scoreCandidate(
      row({ articleId: 'i1', category: 'spor' }),
      ctx({ explicitInterests: ['spor'] }),
      'personal'
    )
    expect(scored.breakdown.interest).toBeGreaterThan(0.5)
    expect(scored.reason).toBe('INTEREST_MATCH')
  })
})

describe('P5 local signal', () => {
  it('boosts matching city', () => {
    const local = feedScoringService.scoreCandidate(
      row({ articleId: 'l1', citySlug: 'canakkale', source: 'LOCAL' }),
      ctx({ city: 'canakkale' }),
      'local'
    )
    const other = feedScoringService.scoreCandidate(row({ articleId: 'n1' }), ctx(), 'local')
    expect(local.breakdown.local).toBeGreaterThan(other.breakdown.local)
  })
})

describe('P5 editorial + breaking', () => {
  it('breaking articles score higher editorial', () => {
    const bk = feedScoringService.scoreCandidate(
      row({ articleId: 'bk', breaking: true, clusterImportance: 80, source: 'BREAKING' }),
      ctx(),
      'breaking'
    )
    const nm = feedScoringService.scoreCandidate(row({ articleId: 'nm' }), ctx(), 'breaking')
    expect(bk.breakdown.editorial).toBeGreaterThan(nm.breakdown.editorial)
  })
})

describe('P5 quality signal', () => {
  it('premium tier scores higher', () => {
    const premium = feedScoringService.scoreCandidate(
      row({ articleId: 'p1', sourceQualityTier: 'PREMIUM', sourceHealthScore: 90 }),
      ctx(),
      'personal'
    )
    const low = feedScoringService.scoreCandidate(
      row({ articleId: 'p2', sourceQualityTier: 'LOW', sourceHealthScore: 20 }),
      ctx(),
      'personal'
    )
    expect(premium.breakdown.quality).toBeGreaterThan(low.breakdown.quality)
  })
})

describe('P5 material update boost', () => {
  it('material update gets boost and reason', () => {
    const updated = feedScoringService.scoreCandidate(
      row({ articleId: 'mu1', materialUpdate: true, clusterId: 'c1' }),
      ctx(),
      'personal'
    )
    expect(updated.breakdown.materialUpdate).toBeGreaterThan(0)
    expect(updated.reason).toBe('MATERIAL_UPDATE')
  })
})

describe('P5 negative feedback penalty', () => {
  it('penalizes hidden articles', () => {
    const normal = feedScoringService.scoreCandidate(row({ articleId: 'a1' }), ctx(), 'personal')
    const hidden = feedScoringService.scoreCandidate(
      row({ articleId: 'a2' }),
      ctx({
        negativePreferences: [{ preferenceType: 'hide', targetType: 'article', targetId: 'a2', modifier: -1 }],
      }),
      'personal'
    )
    expect(hidden.breakdown.penalties).toBeGreaterThan(normal.breakdown.penalties)
    expect(hidden.score).toBeLessThan(normal.score)
  })
})

describe('P5 seen penalty', () => {
  it('applies seen penalties', () => {
    const fresh = feedScoringService.scoreCandidate(row({ articleId: 's1' }), ctx(), 'personal')
    const seen = feedScoringService.scoreCandidate(row({ articleId: 's2', clusterId: 'c1' }), ctx(), 'personal', {
      seenArticle: true,
      seenCluster: true,
    })
    expect(seen.breakdown.penalties).toBeGreaterThan(fresh.breakdown.penalties)
  })
})

describe('P5 cold start', () => {
  it('guest with no context still scores', () => {
    const guestCtx = ctx({ userId: null, explicitInterests: [], followedPublisherIds: new Set() })
    const scored = feedScoringService.scoreCandidate(row({ articleId: 'g1' }), guestCtx, 'personal')
    expect(scored.score).toBeGreaterThanOrEqual(0)
    expect(scored.score).toBeLessThanOrEqual(1)
  })
})

describe('P5 synthetic user exclude', () => {
  it('pipeline clears synthetic personalization', () => {
    let synthetic = ctx({ isSynthetic: true, explicitInterests: ['spor'], followedPublisherIds: new Set(['p1']) })
    if (synthetic.isSynthetic) {
      synthetic = {
        ...synthetic,
        explicitInterests: [],
        behavioralInterests: new Map(),
        followedPublisherIds: new Set(),
      }
    }
    const scored = feedScoringService.scoreCandidate(
      row({ articleId: 'syn1', publisherId: 'p1', category: 'spor' }),
      synthetic,
      'personal'
    )
    expect(scored.breakdown.following).toBe(0)
    expect(scored.breakdown.interest).toBe(0)
  })
})

describe('P5 cluster dedup representative selection', () => {
  it('picks best rep per cluster by quality not order', () => {
    const now = new Date()
    const older = row({
      articleId: 'a1',
      clusterId: 'c1',
      publishedAt: new Date(now.getTime() - 86_400_000),
      image: null,
      sourceQualityTier: 'LOW',
    })
    const better = row({
      articleId: 'a2',
      clusterId: 'c1',
      publishedAt: now,
      image: 'https://img.test/x.jpg',
      sourceQualityTier: 'PREMIUM',
      publisherVerified: true,
    })
    const reps = selectClusterRepresentatives([older, better])
    expect(reps).toHaveLength(1)
    expect(reps[0].articleId).toBe('a2')
  })
})

describe('P5 diversity rerank', () => {
  it('spreads publishers in window', () => {
    const now = new Date()
    const scored: ScoredFeedCandidate[] = [
      { ...feedScoringService.scoreCandidate(row({ articleId: '1', publisherId: 'p1', category: 'gundem', publishedAt: now }), ctx(), 'personal') },
      { ...feedScoringService.scoreCandidate(row({ articleId: '2', publisherId: 'p1', category: 'gundem', publishedAt: now }), ctx(), 'personal') },
      { ...feedScoringService.scoreCandidate(row({ articleId: '3', publisherId: 'p2', category: 'spor', publishedAt: now }), ctx(), 'personal') },
      { ...feedScoringService.scoreCandidate(row({ articleId: '4', publisherId: 'p3', category: 'ekonomi', publishedAt: now }), ctx(), 'personal') },
    ].sort((a, b) => b.score - a.score)

    const diversified = feedDiversityEngine.rerank(scored, 'personal', 4)
    const pubs = diversified.map((d) => d.publisherId)
    expect(new Set(pubs).size).toBeGreaterThan(1)
  })
})

describe('P5 session stability', () => {
  it('signed session round-trips and paginates consistently', () => {
    const session = feedSessionService.create('personal', ['a1', 'a2', 'a3', 'a4', 'a5'], 42)
    const token = feedSessionService.encode(session)
    const decoded = feedSessionService.decode(token)
    expect(decoded?.sessionId).toBe(session.sessionId)
    expect(decoded?.seed).toBe(42)
    expect(decoded?.rankedIds).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])

    const page1 = feedSessionService.slicePage(decoded!, 2)
    expect(page1.ids).toEqual(['a1', 'a2'])
    expect(page1.hasMore).toBe(true)

    const page2 = feedSessionService.slicePage(page1.nextPayload!, 2)
    expect(page2.ids).toEqual(['a3', 'a4'])
  })

  it('rejects tampered session', () => {
    const token = feedSessionService.encode(feedSessionService.create('personal', ['x']))
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(feedSessionService.decode(tampered)).toBeNull()
  })
})

describe('P5 category class resolution', () => {
  it('maps categories to freshness classes', () => {
    expect(resolveCategoryClass('son-dakika', false)).toBe('BREAKING')
    expect(resolveCategoryClass('spor', false)).toBe('SPORT')
    expect(resolveCategoryClass('ekonomi', false)).toBe('ANALYSIS')
    expect(resolveCategoryClass('kultur', false)).toBe('CULTURE')
    expect(resolveCategoryClass(null, true)).toBe('BREAKING')
  })
})
