import 'server-only'

import type { FeedCandidateRow, FeedCandidateSource, FeedMode, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'
import { isColdStartV2Enabled } from '@/lib/feed/featureFlag'
import { FEED_RANKING_CONFIG_V1, FEED_RANKING_VERSION } from '@/lib/feed/rankingConfig'
import { feedCandidateService } from './FeedCandidateService'
import { feedDiversityEngine } from './FeedDiversityEngine'
import { feedRepresentativeSelector } from './FeedRepresentativeSelector'
import { feedScoringService } from './FeedScoringService'
import { feedSessionService, type FeedSessionPayload } from './FeedSessionService'
import type { RankingPipelineInput, RankingPipelineResult } from './FeedRankingPipeline'

export type ColdStartProfileType = 'GUEST' | 'NEW_USER' | 'LIGHT_USER'

const LIGHT_SIGNAL_THRESHOLD = 3

export interface ColdStartMixWeights {
  BREAKING: number
  RECENT: number
  LOCAL: number
  POPULAR: number
  DISCOVERY: number
}

const DEFAULT_MIX: ColdStartMixWeights = {
  BREAKING: 0.2,
  RECENT: 0.25,
  LOCAL: 0.2,
  POPULAR: 0.15,
  DISCOVERY: 0.2,
}

function countSignals(ctx: FeedUserContext): number {
  let n = ctx.explicitInterests.length
  n += ctx.behavioralInterests.size
  n += ctx.followedPublisherIds.size
  n += ctx.publisherAffinities.size
  return n
}

function logColdStart(event: string, meta: Record<string, unknown>): void {
  console.info(`[cold-start] ${event}`, meta)
}

export class FeedColdStartService {
  isEnabled(): boolean {
    return isColdStartV2Enabled()
  }

  /** Resolve cold-start profile; null when user has enough signals. */
  resolveProfile(ctx: FeedUserContext): ColdStartProfileType | null {
    if (!ctx.userId) return 'GUEST'
    const signals = countSignals(ctx)
    if (signals === 0 && ctx.explicitInterests.length === 0 && ctx.followedPublisherIds.size === 0) {
      return 'NEW_USER'
    }
    if (signals < LIGHT_SIGNAL_THRESHOLD) return 'LIGHT_USER'
    return null
  }

  /** Onboarding boost from profile interests / city / district. */
  applyOnboardingBoost(
    scored: ScoredFeedCandidate[],
    ctx: FeedUserContext
  ): ScoredFeedCandidate[] {
    const city = ctx.city?.trim().toLowerCase()
    const interests = new Set(ctx.explicitInterests.map((i) => i.trim().toLowerCase()).filter(Boolean))

    return scored.map((row) => {
      let boost = 0
      const cat = (row.category ?? '').toLowerCase()
      if (city && (row.citySlug?.toLowerCase() === city || row.headline.toLowerCase().includes(city))) {
        boost += 0.12
      }
      for (const interest of interests) {
        if (cat.includes(interest) || interest.includes(cat)) boost = Math.max(boost, 0.1)
      }
      if (boost <= 0) return row
      return {
        ...row,
        score: row.score + boost,
        breakdown: { ...row.breakdown, interest: Math.min(1, row.breakdown.interest + boost) },
        reason: row.reason === 'RECENT' ? 'INTEREST_MATCH' : row.reason,
      }
    })
  }

  private async fetchColdPools(
    input: RankingPipelineInput,
    ctx: FeedUserContext
  ): Promise<Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>> {
    const limits = FEED_RANKING_CONFIG_V1.candidatePoolLimits
    const base = {
      limit: input.limit * 3,
      cursor: null,
      userId: input.userId,
      citySlug: input.citySlug ?? ctx.city,
      districtSlug: input.districtSlug ?? ctx.districtSlug,
      region: input.region,
      excludeArticleIds: input.seenArticles,
      excludeClusterIds: input.seenClusters,
    }

    const [breaking, recent, local, popular, discovery] = await Promise.all([
      feedCandidateService.fetchBreaking({ ...base, limit: limits.BREAKING }),
      feedCandidateService.fetchRecent({ ...base, limit: limits.RECENT }),
      feedCandidateService.fetchLocal({ ...base, limit: limits.LOCAL }),
      feedCandidateService.fetchPopular({ ...base, limit: limits.POPULAR }),
      feedCandidateService.fetchDiscovery({ ...base, limit: limits.DISCOVERY }),
    ])

    return { BREAKING: breaking, RECENT: recent, LOCAL: local, POPULAR: popular, DISCOVERY: discovery }
  }

  /** Build cold-start ranked page using P5 diversity + cluster dedup. */
  async buildFeed(
    input: RankingPipelineInput,
    ctx: FeedUserContext,
    profile: ColdStartProfileType
  ): Promise<RankingPipelineResult> {
    logColdStart('cold_start_feed_requested', {
      profile,
      mode: input.mode,
      userId: input.userId ? 'auth' : 'guest',
    })
    logColdStart('cold_start_mode', { profile, mode: input.mode })

    const pools = await this.fetchColdPools(input, ctx)
    const flat: FeedCandidateRow[] = []
    const seen = new Set<string>()
    const weights = DEFAULT_MIX
    const order: FeedCandidateSource[] = ['BREAKING', 'RECENT', 'LOCAL', 'POPULAR', 'DISCOVERY']

    for (const source of order) {
      const pool = pools[source] ?? []
      const take = Math.max(1, Math.ceil(input.limit * 2 * (weights[source as keyof ColdStartMixWeights] ?? 0.1)))
      for (const row of pool.slice(0, take)) {
        if (seen.has(row.articleId)) continue
        seen.add(row.articleId)
        flat.push({ ...row, source })
      }
    }

    // Backfill from remaining available candidates if flat has fewer than requested limit
    if (flat.length < input.limit) {
      for (const source of order) {
        const pool = pools[source] ?? []
        for (const row of pool) {
          if (seen.has(row.articleId)) continue
          seen.add(row.articleId)
          flat.push({ ...row, source })
          if (flat.length >= input.limit * 2) break
        }
      }
    }

    // Secondary backfill without seen exclusions if user has seen all current items
    if (flat.length < input.limit && (input.seenArticles.size > 0 || input.seenClusters.size > 0)) {
      const unsuppressedPools = await this.fetchColdPools(
        { ...input, seenArticles: new Set(), seenClusters: new Set() },
        ctx
      )
      for (const source of order) {
        const pool = unsuppressedPools[source] ?? []
        for (const row of pool) {
          if (seen.has(row.articleId)) continue
          seen.add(row.articleId)
          flat.push({ ...row, source })
          if (flat.length >= input.limit * 2) break
        }
      }
    }

    const reps = feedRepresentativeSelector.select(flat)
    let scored = feedScoringService.scoreAll(reps, ctx, input.mode, input.seenArticles, input.seenClusters)
    scored = this.applyOnboardingBoost(scored, ctx)
    const diversified = feedDiversityEngine.rerank(scored, input.mode, Math.max(input.limit * 3, input.limit))

    if (!diversified.length) {
      logColdStart('cold_start_empty', { profile, mode: input.mode })
    }

    const rankedIds = diversified.map((r) => r.articleId)
    const session = feedSessionService.create(input.mode, rankedIds)
    const { ids } = feedSessionService.slicePage(session, input.limit)
    const pageRows = diversified.filter((r) => ids.includes(r.articleId))
    const orderedPage = feedSessionService.reorderBySession(pageRows, session)

    const candidateCounts: Record<string, number> = { cold_start_profile: 1 }
    for (const [k, v] of Object.entries(pools)) candidateCounts[k] = v?.length ?? 0

    return {
      ranked: orderedPage,
      session: { ...session, offset: ids.length },
      sessionToken: feedSessionService.encode({ ...session, offset: ids.length }),
      rankingVersion: `${FEED_RANKING_VERSION}-cold`,
      candidateCounts,
    }
  }
}

export const feedColdStartService = new FeedColdStartService()

export function shouldUseColdStart(ctx: FeedUserContext): ColdStartProfileType | null {
  if (!isColdStartV2Enabled()) return null
  return feedColdStartService.resolveProfile(ctx)
}
