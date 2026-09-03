import 'server-only'

import type { FeedCandidateRow, FeedCandidateSource, FeedMode, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'
import { FEED_RANKING_CONFIG_V1, FEED_RANKING_VERSION } from '@/lib/feed/rankingConfig'
import { feedCandidateService } from './FeedCandidateService'
import { feedDiversityEngine } from './FeedDiversityEngine'
import { feedInterestAggregator } from './FeedInterestAggregator'
import { feedRepresentativeSelector } from './FeedRepresentativeSelector'
import { feedScoringService } from './FeedScoringService'
import { feedSessionService, type FeedSessionPayload } from './FeedSessionService'
import { feedUserContextService } from './FeedUserContextService'
import { feedColdStartService } from './FeedColdStartService'
import { isColdStartEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedSeenService } from './FeedSeenService'

export interface RankingPipelineInput {
  userId: string | null
  mode: FeedMode
  limit: number
  cursor?: string | null
  sessionToken?: string | null
  refresh?: boolean
  citySlug?: string | null
  districtSlug?: string | null
  region?: string | null
  seenArticles: Set<string>
  seenClusters: Set<string>
}

export interface RankingPipelineResult {
  ranked: ScoredFeedCandidate[]
  session: FeedSessionPayload
  sessionToken: string
  rankingVersion: string
  candidateCounts: Record<string, number>
}

async function fetchPools(
  mode: FeedMode,
  opts: {
    limit: number
    userId: string | null
    citySlug?: string | null
    districtSlug?: string | null
    region?: string | null
    excludeArticleIds: Set<string>
    excludeClusterIds: Set<string>
    publishedBefore?: Date | string | null
  }
): Promise<Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>> {
  const base = {
    limit: opts.limit,
    cursor: null as null,
    userId: opts.userId,
    citySlug: opts.citySlug,
    districtSlug: opts.districtSlug,
    region: opts.region,
    excludeArticleIds: opts.excludeArticleIds,
    excludeClusterIds: opts.excludeClusterIds,
    publishedBefore: opts.publishedBefore ?? null,
  }

  const limits = FEED_RANKING_CONFIG_V1.candidatePoolLimits

  if (mode === 'personal') {
    const [featured, breaking, recent, popular, local, discovery, following] = await Promise.all([
      feedCandidateService.fetchFeatured({ ...base, limit: limits.FEATURED }),
      feedCandidateService.fetchBreaking({ ...base, limit: limits.BREAKING }),
      feedCandidateService.fetchRecent({ ...base, limit: limits.RECENT }),
      feedCandidateService.fetchPopular({ ...base, limit: limits.POPULAR }),
      feedCandidateService.fetchLocal({ ...base, limit: limits.LOCAL }),
      feedCandidateService.fetchDiscovery({ ...base, limit: limits.DISCOVERY }),
      opts.userId ? feedCandidateService.fetchFollowing({ ...base, limit: limits.FOLLOWING }) : Promise.resolve([]),
    ])
    return {
      FEATURED: featured,
      BREAKING: breaking,
      RECENT: recent,
      POPULAR: popular,
      LOCAL: local,
      DISCOVERY: discovery,
      FOLLOWING: following,
    }
  }

  const rows = await feedCandidateService.fetchForMode(mode, base)
  const source: FeedCandidateSource =
    mode === 'breaking' ? 'BREAKING' : mode === 'local' ? 'LOCAL' : mode === 'following' ? 'FOLLOWING' : 'RECENT'
  return { [source]: rows }
}

function flattenPools(pools: Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>): FeedCandidateRow[] {
  const out: FeedCandidateRow[] = []
  const seen = new Set<string>()
  for (const pool of Object.values(pools)) {
    for (const row of pool ?? []) {
      if (seen.has(row.articleId)) continue
      seen.add(row.articleId)
      out.push(row)
    }
  }
  return out
}

function countPools(pools: Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [key, pool] of Object.entries(pools)) counts[key] = pool?.length ?? 0
  return counts
}

function oldestPublishedIso(rows: Array<{ publishedAt: Date }>): string | null {
  if (!rows.length) return null
  let min = rows[0]!.publishedAt.getTime()
  for (const r of rows) {
    const t = r.publishedAt.getTime()
    if (t < min) min = t
  }
  return new Date(min).toISOString()
}

function rankWindow(
  flat: FeedCandidateRow[],
  ctx: FeedUserContext,
  mode: FeedMode,
  seenArticles: Set<string>,
  seenClusters: Set<string>,
  limit: number
): ScoredFeedCandidate[] {
  const reps = feedRepresentativeSelector.select(flat)
  const scored = feedScoringService.scoreAll(reps, ctx, mode, seenArticles, seenClusters)
  return feedDiversityEngine.rerank(scored, mode, Math.max(limit * 3, limit))
}

export class FeedRankingPipeline {
  /** Build / append a bounded ranked window excluding already-served + seen IDs. */
  private async buildNextWindow(
    input: RankingPipelineInput,
    ctx: FeedUserContext,
    excludeArticleIds: Set<string>,
    publishedBefore: string | null | undefined
  ): Promise<{ ranked: ScoredFeedCandidate[]; candidateCounts: Record<string, number>; olderThan: string | null }> {
    // Recent/popular/personal pools: exclude served IDs only (do not time-gate yet),
    // so remaining unseen recent inventory is consumed before older fallback.
    let pools = await fetchPools(input.mode, {
      limit: input.limit * 4,
      userId: input.userId,
      citySlug: input.citySlug,
      districtSlug: input.districtSlug,
      region: input.region,
      excludeArticleIds,
      excludeClusterIds: input.seenClusters,
      publishedBefore: null,
    })
    let flat = flattenPools(pools)
    let candidateCounts = countPools(pools)

    // Tier: older LEGACY_ALLOWED when recent/canonical pools underfill after exclusions
    if (flat.length < input.limit) {
      const before =
        publishedBefore ??
        (flat.length ? oldestPublishedIso(flat) : new Date().toISOString())
      const older = await feedCandidateService.fetchOlderLegacyAllowed({
        limit: Math.max(input.limit * 3, 45),
        cursor: null,
        excludeArticleIds,
        excludeClusterIds: input.seenClusters,
        publishedBefore: before!,
        userId: input.userId,
      })
      candidateCounts.OLDER_LEGACY = older.length
      const seen = new Set(flat.map((r) => r.articleId))
      for (const row of older) {
        if (seen.has(row.articleId) || excludeArticleIds.has(row.articleId)) continue
        seen.add(row.articleId)
        flat.push(row)
      }
    }

    const ranked = rankWindow(flat, ctx, input.mode, input.seenArticles, input.seenClusters, input.limit)
    const olderThan = oldestPublishedIso(ranked) ?? publishedBefore ?? null
    return { ranked, candidateCounts, olderThan }
  }

  private async pageFromSession(
    session: FeedSessionPayload,
    input: RankingPipelineInput,
    ctx: FeedUserContext,
    rankingVersion: string,
    extraCounts?: Record<string, number>
  ): Promise<RankingPipelineResult> {
    let working = session
    let candidateCounts: Record<string, number> = { ...(extraCounts ?? {}) }

    // Ensure enough unused IDs remain; otherwise refill a bounded older/unseen window.
    const remaining = working.rankedIds.length - (working.offset ?? 0)
    if (remaining < input.limit && !working.corpusExhausted) {
      const seed = new Set<string>([...input.seenArticles, ...working.rankedIds])
      const exclude = await feedSeenService.expandArticleIdentities(seed)
      const { ranked, candidateCounts: counts, olderThan } = await this.buildNextWindow(
        input,
        ctx,
        exclude,
        working.olderThan
      )
      candidateCounts = { ...candidateCounts, ...counts, session_refill: ranked.length }
      const newIds = ranked.map((r) => r.articleId)
      working = feedSessionService.appendWindow(working, newIds, olderThan)
      if (newIds.length === 0) {
        working = { ...working, corpusExhausted: true }
      }
    }

    const { ids, nextPayload, hasMoreInSnapshot } = feedSessionService.slicePage(working, input.limit)
    if (!ids.length) {
      return {
        ranked: [],
        session: { ...nextPayload, corpusExhausted: true },
        sessionToken: feedSessionService.encode({ ...nextPayload, corpusExhausted: true }),
        rankingVersion,
        candidateCounts: { ...candidateCounts, session_resume: 0, hasMore: 0 },
      }
    }

    const rows = await feedCandidateService.fetchByIds(ids)
    const ordered = feedSessionService.reorderBySession(rows, nextPayload)
    const scored = feedScoringService.scoreAll(ordered, ctx, input.mode, input.seenArticles, input.seenClusters)

    // Optimistic has-more: more in snapshot OR corpus not proven exhausted
    const mayHaveMore = hasMoreInSnapshot || !nextPayload.corpusExhausted
    candidateCounts.session_resume = ids.length
    candidateCounts.hasMore = mayHaveMore ? 1 : 0

    return {
      ranked: scored,
      session: nextPayload,
      sessionToken: feedSessionService.encode(nextPayload),
      rankingVersion,
      candidateCounts,
    }
  }

  /** 9-step ranking pipeline ensuring all published news flow through algorithm. */
  async run(input: RankingPipelineInput): Promise<RankingPipelineResult> {
    // 1. Load user context (exclude SYNTHETIC_TEST)
    let ctx: FeedUserContext = await feedUserContextService.load(input.userId)
    if (ctx.isSynthetic) ctx = { ...ctx, explicitInterests: [], behavioralInterests: new Map(), followedPublisherIds: new Set() }

    // 2. On-demand behavioral aggregation (bounded, authed only)
    if (input.userId && !ctx.isSynthetic && !input.sessionToken) {
      await feedInterestAggregator.aggregateForUser(input.userId).catch(() => {})
      ctx = await feedUserContextService.load(input.userId)
    }

    // Session stability — continue / refill existing ranked snapshot
    if (input.sessionToken && !input.refresh) {
      const existing = feedSessionService.decode(input.sessionToken)
      if (existing && existing.mode === input.mode) {
        return this.pageFromSession(existing, input, ctx, FEED_RANKING_VERSION, {
          session_continue: 1,
        })
      }
    }

    // 2b. Cold Start V2 — fallback mix when no/low signals (P6)
    const coldStartAllowed = await isColdStartEffectiveForUser(input.userId)
    if (coldStartAllowed && input.mode === 'personal' && !input.sessionToken) {
      const coldProfile = feedColdStartService.resolveProfile(ctx)
      if (coldProfile) {
        return feedColdStartService.buildFeed(input, ctx, coldProfile)
      }
    }

    // 3–6. First window
    const exclude = await feedSeenService.expandArticleIdentities(new Set(input.seenArticles))
    const { ranked: diversified, candidateCounts, olderThan } = await this.buildNextWindow(
      input,
      ctx,
      exclude,
      null
    )

    const rankedIds = diversified.map((r) => r.articleId)
    const session = feedSessionService.create(input.mode, rankedIds, undefined, {
      olderThan,
      generation: 0,
      corpusExhausted: rankedIds.length === 0,
    })

    return this.pageFromSession(session, input, ctx, FEED_RANKING_VERSION, candidateCounts)
  }
}

export const feedRankingPipeline = new FeedRankingPipeline()
