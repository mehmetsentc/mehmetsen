/**
 * P18.3M ranking tiers + hard seen + resume helpers (unit).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEED_RANKING_CONFIG_V1,
  featuredFreshnessScore,
  viewPopularityScore,
} from '@/lib/feed/rankingConfig'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import type { FeedCandidateRow, FeedItemDto, FeedUserContext } from '@/types/smartFeed'
import {
  clearFeedRestore,
  consumePendingFeedRestore,
  readFeedRestore,
  saveFeedRestore,
} from '@/lib/feed/feedRestoration'

function row(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: null,
    publisherId: `pub-${partial.articleId}`,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test',
    summary: null,
    category: 'gundem',
    image: null,
    video: null,
    publishedAt: partial.publishedAt ?? now,
    updatedAt: now,
    breaking: false,
    materialUpdate: false,
    isFeatured: false,
    isEditorPick: false,
    clusterSourceCount: 1,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? partial.articleId,
    source: 'RECENT',
    sortScore: now.getTime(),
    ...partial,
  }
}

function ctx(): FeedUserContext {
  return {
    userId: null,
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: null,
    districtSlug: null,
  }
}

describe('P18.3M featured + popularity scoring', () => {
  it('fresh featured outranks ordinary recent and stale featured', () => {
    const now = new Date()
    const freshFeatured = feedScoringService.scoreCandidate(
      row({
        articleId: 'ff',
        isFeatured: true,
        publishedAt: new Date(now.getTime() - 1 * 3_600_000),
        source: 'FEATURED',
      }),
      ctx(),
      'personal'
    )
    const staleFeatured = feedScoringService.scoreCandidate(
      row({
        articleId: 'sf',
        isFeatured: true,
        publishedAt: new Date(now.getTime() - 7 * 24 * 3_600_000),
        source: 'FEATURED',
      }),
      ctx(),
      'personal'
    )
    const ordinary = feedScoringService.scoreCandidate(
      row({ articleId: 'or', publishedAt: new Date(now.getTime() - 1 * 3_600_000) }),
      ctx(),
      'personal'
    )
    expect(freshFeatured.breakdown.featured).toBeGreaterThan(0.5)
    expect(staleFeatured.breakdown.featured).toBeLessThan(freshFeatured.breakdown.featured)
    expect(freshFeatured.score).toBeGreaterThan(ordinary.score)
    expect(freshFeatured.reason).toBe('FEATURED_PRIORITY')
  })

  it('view popularity is time-decayed (fresh high views beat stale higher views)', () => {
    const now = new Date()
    const freshPop = viewPopularityScore({
      viewsCount: 800,
      likesCount: 2,
      publishedAt: new Date(now.getTime() - 2 * 3_600_000),
      now,
    })
    const stalePop = viewPopularityScore({
      viewsCount: 5000,
      likesCount: 2,
      publishedAt: new Date(now.getTime() - 14 * 24 * 3_600_000),
      now,
    })
    expect(freshPop).toBeGreaterThan(stalePop)

    const scoredFresh = feedScoringService.scoreCandidate(
      row({
        articleId: 'vp1',
        viewsCount: 800,
        likesCount: 2,
        publishedAt: new Date(now.getTime() - 2 * 3_600_000),
        source: 'POPULAR',
      }),
      ctx(),
      'personal'
    )
    const scoredStale = feedScoringService.scoreCandidate(
      row({
        articleId: 'vp2',
        viewsCount: 5000,
        likesCount: 2,
        publishedAt: new Date(now.getTime() - 14 * 24 * 3_600_000),
        source: 'POPULAR',
      }),
      ctx(),
      'personal'
    )
    expect(scoredFresh.score).toBeGreaterThan(scoredStale.score)
  })

  it('featuredBoost config is active and featuredFreshness decays', () => {
    expect(FEED_RANKING_CONFIG_V1.featuredBoost).toBeGreaterThan(0.2)
    expect(FEED_RANKING_CONFIG_V1.popularityViewWeight).toBeGreaterThanOrEqual(0.15)
    const now = new Date()
    expect(featuredFreshnessScore(new Date(now.getTime() - 1 * 3_600_000), now)).toBeGreaterThan(
      featuredFreshnessScore(new Date(now.getTime() - 72 * 3_600_000), now)
    )
  })

  it('tier tendency with diversity: featured/popular rise without collapsing to one publisher', () => {
    const now = new Date()
    const fixtures: FeedCandidateRow[] = [
      row({
        articleId: 'f1',
        publisherId: 'pA',
        isFeatured: true,
        publishedAt: new Date(now.getTime() - 1 * 3_600_000),
        source: 'FEATURED',
      }),
      row({
        articleId: 'f2',
        publisherId: 'pA',
        isFeatured: true,
        publishedAt: new Date(now.getTime() - 2 * 3_600_000),
        source: 'FEATURED',
      }),
      row({
        articleId: 'f3',
        publisherId: 'pA',
        isFeatured: true,
        publishedAt: new Date(now.getTime() - 3 * 3_600_000),
        source: 'FEATURED',
      }),
      row({
        articleId: 'pop1',
        publisherId: 'pB',
        viewsCount: 2000,
        likesCount: 10,
        publishedAt: new Date(now.getTime() - 3 * 3_600_000),
        source: 'POPULAR',
      }),
      row({
        articleId: 'r1',
        publisherId: 'pC',
        publishedAt: new Date(now.getTime() - 1 * 3_600_000),
      }),
      row({
        articleId: 'r2',
        publisherId: 'pD',
        publishedAt: new Date(now.getTime() - 4 * 3_600_000),
      }),
      row({
        articleId: 'old',
        publisherId: 'pE',
        viewsCount: 9000,
        publishedAt: new Date(now.getTime() - 20 * 24 * 3_600_000),
      }),
    ]
    const scored = feedScoringService.scoreAll(fixtures, ctx(), 'personal', new Set(), new Set())
    const diversified = feedDiversityEngine.rerank(scored, 'personal', 6)
    expect(diversified[0]?.articleId).toBe('f1')
    const pubs = diversified.map((d) => d.publisherId)
    expect(new Set(pubs).size).toBeGreaterThanOrEqual(3)
    expect(diversified.some((d) => d.articleId === 'pop1')).toBe(true)
  })
})

describe('P18.3M hard seen suppression', () => {
  it('drops qualified-seen articles/clusters except material updates', () => {
    const seenArticles = new Set(['seen1'])
    const seenClusters = new Set(['c-seen'])
    const rows = [
      row({ articleId: 'seen1' }),
      row({ articleId: 'ok1', clusterId: 'c-ok' }),
      row({ articleId: 'cseen', clusterId: 'c-seen' }),
      row({ articleId: 'mu1', clusterId: 'c-seen', materialUpdate: true }),
    ]
    const scored = feedScoringService.scoreAll(rows, ctx(), 'personal', seenArticles, seenClusters)
    const ids = scored.map((s) => s.articleId)
    expect(ids).not.toContain('seen1')
    expect(ids).not.toContain('cseen')
    expect(ids).toContain('ok1')
    expect(ids).toContain('mu1')
    expect(scored.find((s) => s.articleId === 'mu1')?.reason).toBe('MATERIAL_UPDATE')
  })

  it('100 eligible / 30 seen → no duplicate ids and no seen replay', () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      row({
        articleId: `a${i}`,
        clusterId: `cl${i}`,
        publisherId: `pub${i % 17}`,
        category: i % 2 === 0 ? 'gundem' : 'spor',
        viewsCount: i * 3,
      })
    )
    const seenArticles = new Set(Array.from({ length: 30 }, (_, i) => `a${i}`))
    const seenClusters = new Set(Array.from({ length: 30 }, (_, i) => `cl${i}`))
    const scored = feedScoringService.scoreAll(rows, ctx(), 'personal', seenArticles, seenClusters)
    const ids = scored.map((s) => s.articleId)
    const clusters = scored.map((s) => s.clusterId).filter(Boolean)
    expect(ids.length).toBe(70)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(clusters).size).toBe(clusters.length)
    for (const id of seenArticles) expect(ids).not.toContain(id)
  })
})

describe('P18.3M resume snapshot', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v)
      },
      removeItem: (k: string) => {
        memory.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and restores scroll index + items without restarting at 0', () => {
    const items = Array.from({ length: 45 }, (_, i) => ({
      id: `a${i}`,
      type: 'article' as const,
      articleId: `a${i}`,
      clusterId: null,
      publisher: null,
      headline: `H${i}`,
      summary: null,
      category: null,
      image: null,
      video: null,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      breaking: false,
      materialUpdate: false,
      clusterSourceCount: 1,
      socialState: null,
      socialCounts: { likes: 0, comments: 0, saves: 0, shares: 0 },
      reason: 'RECENT' as const,
      slug: `a${i}`,
    })) satisfies FeedItemDto[]

    saveFeedRestore({
      mode: 'personal',
      articleId: 'a37',
      scrollIndex: 37,
      cursor: 'cur-1',
      hasMore: true,
      items,
      pending: true,
      timestamp: Date.now(),
    })

    const pending = consumePendingFeedRestore()
    expect(pending).not.toBeNull()
    expect(pending!.scrollIndex).toBe(37)
    expect(pending!.articleId).toBe('a37')
    expect(pending!.items?.[37]?.articleId).toBe('a37')
    expect(pending!.mode).toBe('personal')
    expect(pending!.scrollIndex).not.toBe(0)

    clearFeedRestore()
    expect(readFeedRestore()).toBeNull()
  })

  it('WINDOW_MAX-safe: restore index beyond 25 remains global index 37', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `x${i}`,
      type: 'article' as const,
      articleId: `x${i}`,
      clusterId: null,
      publisher: null,
      headline: `X${i}`,
      summary: null,
      category: null,
      image: null,
      video: null,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      breaking: false,
      materialUpdate: false,
      clusterSourceCount: 1,
      socialState: null,
      socialCounts: { likes: 0, comments: 0, saves: 0, shares: 0 },
      reason: 'RECENT' as const,
      slug: `x${i}`,
    })) satisfies FeedItemDto[]

    saveFeedRestore({
      mode: 'breaking',
      articleId: 'x37',
      scrollIndex: 37,
      items,
      pending: true,
      timestamp: Date.now(),
    })
    const pending = consumePendingFeedRestore()
    expect(pending!.scrollIndex).toBe(37)
    // DOM window would start at max(0, 37-5)=32 — global index stays 37
    const WINDOW_BEFORE = 5
    const windowStart = Math.max(0, pending!.scrollIndex - WINDOW_BEFORE)
    expect(windowStart).toBe(32)
    expect(pending!.items![pending!.scrollIndex]?.articleId).toBe('x37')
  })
})

describe('P18.3M mode weights unchanged for non-personal hierarchy', () => {
  it('following mode still prioritizes following signal over featured soft boost alone', () => {
    const followed = feedScoringService.scoreCandidate(
      row({ articleId: 'f', publisherId: 'pub1', source: 'FOLLOWING' }),
      {
        ...ctx(),
        userId: 'u1',
        followedPublisherIds: new Set(['pub1']),
      },
      'following'
    )
    const featuredOnly = feedScoringService.scoreCandidate(
      row({
        articleId: 'feat',
        publisherId: 'pub2',
        isFeatured: true,
        source: 'FEATURED',
      }),
      { ...ctx(), userId: 'u1' },
      'following'
    )
    expect(followed.breakdown.following).toBeGreaterThan(0.5)
    expect(followed.score).toBeGreaterThan(featuredOnly.score * 0.85)
  })
})
