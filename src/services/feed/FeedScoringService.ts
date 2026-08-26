import type { FeedCandidateRow, FeedMode, FeedRankReason, FeedScoreBreakdown, ScoredFeedCandidate } from '@/types/smartFeed'
import {
  FEED_RANKING_CONFIG_V1,
  freshnessScore,
  normalizeEngagementRate,
  resolveCategoryClass,
  resolveModeWeights,
} from '@/lib/feed/rankingConfig'
import type { FeedUserContext } from '@/types/smartFeed'
import { feedUserContextService } from './FeedUserContextService'

const QUALITY_TIER_SCORE: Record<string, number> = {
  PREMIUM: 1,
  TRUSTED: 0.85,
  STANDARD: 0.65,
  UNTESTED: 0.45,
  LOW: 0.25,
}

function qualityScore(row: FeedCandidateRow): number {
  const tier = (row.sourceQualityTier ?? 'UNTESTED').toUpperCase()
  const tierScore = QUALITY_TIER_SCORE[tier] ?? 0.45
  const health = Math.min(100, Math.max(0, row.sourceHealthScore ?? 50)) / 100
  const verified = row.publisherVerified ? 0.1 : 0
  return Math.min(1, tierScore * 0.7 + health * 0.25 + verified)
}

function editorialScore(row: FeedCandidateRow, mode: FeedMode): number {
  const importance = Math.min(100, Math.max(0, row.clusterImportance ?? 0)) / 100
  const breaking = row.breaking ? 0.35 : 0
  const multiSource = Math.min(0.25, (row.clusterSourceCount - 1) * 0.08)
  const modeBoost = mode === 'breaking' ? 0.15 : 0
  return Math.min(1, importance * 0.5 + breaking + multiSource + modeBoost)
}

function localScore(row: FeedCandidateRow, ctx: FeedUserContext, mode: FeedMode): number {
  if (mode !== 'local' && !ctx.city) return 0
  const userCity = ctx.city?.trim().toLowerCase()
  const rowCity = row.citySlug?.trim().toLowerCase()
  if (userCity && rowCity && userCity === rowCity) return 0.95
  if (row.source === 'LOCAL') return 0.75
  if (rowCity) return 0.4
  return 0
}

function followingScore(row: FeedCandidateRow, ctx: FeedUserContext): number {
  if (!row.publisherId) return 0
  if (feedUserContextService.isPublisherFollowed(ctx, row.publisherId)) {
    const affinity = feedUserContextService.publisherAffinity(ctx, row.publisherId)
    return Math.min(1, 0.75 + affinity * 0.25)
  }
  return 0
}

function interestScore(row: FeedCandidateRow, ctx: FeedUserContext): number {
  return feedUserContextService.interestScore(ctx, row.category)
}

function engagementScore(row: FeedCandidateRow): number {
  const raw =
    row.likesCount * 3 + row.commentsCount * 2 + row.savesCount * 2.5 + row.sharesCount * 2 + (row.viewsCount ?? 0) * 0.01
  return normalizeEngagementRate(raw)
}

function discoveryScore(row: FeedCandidateRow): number {
  if (row.source === 'DISCOVERY') return 0.85
  return 0.15
}

function deriveReason(breakdown: FeedScoreBreakdown, row: FeedCandidateRow): FeedRankReason {
  if (row.materialUpdate) return 'MATERIAL_UPDATE'
  if (row.breaking && breakdown.editorial > 0.5) return 'BREAKING_URGENT'
  if (breakdown.following > 0.5) return 'FOLLOWING_FRESH'
  if (breakdown.local > 0.5) return 'LOCAL_RELEVANT'
  if (breakdown.interest > 0.45) return 'INTEREST_MATCH'
  if (breakdown.editorial > 0.55) return 'EDITORIAL_PRIORITY'
  if (row.source === 'DISCOVERY') return 'DISCOVERY'
  if (row.source === 'POPULAR') return 'POPULAR'
  if (row.source === 'BREAKING') return 'BREAKING_URGENT'
  return row.source === 'LOCAL' ? 'LOCAL_RELEVANT' : 'RECENT'
}

export class FeedScoringService {
  scoreCandidate(
    row: FeedCandidateRow,
    ctx: FeedUserContext,
    mode: FeedMode,
    opts?: { seenArticle?: boolean; seenCluster?: boolean }
  ): ScoredFeedCandidate {
    const weights = resolveModeWeights(mode)
    const catClass = resolveCategoryClass(row.category, row.breaking)

    const signals = {
      following: followingScore(row, ctx),
      freshness: freshnessScore(row.publishedAt, catClass),
      interest: interestScore(row, ctx),
      local: localScore(row, ctx, mode),
      editorial: editorialScore(row, mode),
      quality: qualityScore(row),
      engagement: engagementScore(row),
      discovery: discoveryScore(row),
      materialUpdate: row.materialUpdate ? FEED_RANKING_CONFIG_V1.materialUpdateBoost : 0,
    }

    let penalties = 0
    if (opts?.seenArticle) penalties += weights.seenPenalty * 0.6
    if (opts?.seenCluster) penalties += weights.seenPenalty * 0.4
    if (feedUserContextService.hasNegativePreference(ctx, {
      articleId: row.articleId,
      publisherId: row.publisherId,
      category: row.category,
    })) {
      penalties += weights.negativeFeedbackPenalty
    }

    const weighted =
      signals.following * weights.following +
      signals.freshness * weights.freshness +
      signals.interest * weights.interest +
      signals.local * weights.local +
      signals.editorial * weights.editorial +
      signals.quality * weights.quality +
      signals.engagement * weights.engagement +
      signals.discovery * weights.discovery +
      signals.materialUpdate

    const maxWeight =
      weights.following +
      weights.freshness +
      weights.interest +
      weights.local +
      weights.editorial +
      weights.quality +
      weights.engagement +
      weights.discovery +
      FEED_RANKING_CONFIG_V1.materialUpdateBoost

    const normalized = maxWeight > 0 ? Math.min(1, Math.max(0, (weighted - penalties) / maxWeight)) : 0

    const breakdown: FeedScoreBreakdown = {
      ...signals,
      penalties,
      total: normalized,
    }

    return {
      ...row,
      score: normalized,
      reason: deriveReason(breakdown, row),
      breakdown,
    }
  }

  scoreAll(
    rows: FeedCandidateRow[],
    ctx: FeedUserContext,
    mode: FeedMode,
    seenArticles: Set<string>,
    seenClusters: Set<string>
  ): ScoredFeedCandidate[] {
    return rows
      .map((row) =>
        this.scoreCandidate(row, ctx, mode, {
          seenArticle: seenArticles.has(row.articleId),
          seenCluster: row.clusterId ? seenClusters.has(row.clusterId) : false,
        })
      )
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.publishedAt.getTime() - a.publishedAt.getTime()
      })
  }
}

export const feedScoringService = new FeedScoringService()
