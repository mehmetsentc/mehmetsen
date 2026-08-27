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
import { isColdStartV2Enabled } from '@/lib/feed/featureFlag'

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
  }
): Promise<Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>> {
  const base = {
    limit: opts.limit,
    cursor: null,
    userId: opts.userId,
    citySlug: opts.citySlug,
    districtSlug: opts.districtSlug,
    region: opts.region,
    excludeArticleIds: opts.excludeArticleIds,
    excludeClusterIds: opts.excludeClusterIds,
  }

  const limits = FEED_RANKING_CONFIG_V1.candidatePoolLimits

  if (mode === 'personal') {
    const [breaking, recent, popular, local, discovery, following] = await Promise.all([
      feedCandidateService.fetchBreaking({ ...base, limit: limits.BREAKING }),
      feedCandidateService.fetchRecent({ ...base, limit: limits.RECENT }),
      feedCandidateService.fetchPopular({ ...base, limit: limits.POPULAR }),
      feedCandidateService.fetchLocal({ ...base, limit: limits.LOCAL }),
      feedCandidateService.fetchDiscovery({ ...base, limit: limits.DISCOVERY }),
      opts.userId ? feedCandidateService.fetchFollowing({ ...base, limit: limits.FOLLOWING }) : Promise.resolve([]),
    ])
    return { BREAKING: breaking, RECENT: recent, POPULAR: popular, LOCAL: local, DISCOVERY: discovery, FOLLOWING: following }
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

export class FeedRankingPipeline {
  /** 9-step P5 ranking pipeline. */
  async run(input: RankingPipelineInput): Promise<RankingPipelineResult> {
    // 1. Load user context (exclude SYNTHETIC_TEST)
    let ctx: FeedUserContext = await feedUserContextService.load(input.userId)
    if (ctx.isSynthetic) ctx = { ...ctx, explicitInterests: [], behavioralInterests: new Map(), followedPublisherIds: new Set() }

    // 2. On-demand behavioral aggregation (bounded, authed only)
    if (input.userId && !ctx.isSynthetic && !input.sessionToken) {
      await feedInterestAggregator.aggregateForUser(input.userId).catch(() => {})
      ctx = await feedUserContextService.load(input.userId)
    }

    // 2b. Cold Start V2 — fallback mix when no/low signals (P6)
    if (isColdStartV2Enabled() && input.mode === 'personal' && !input.sessionToken) {
      const coldProfile = feedColdStartService.resolveProfile(ctx)
      if (coldProfile) {
        return feedColdStartService.buildFeed(input, ctx, coldProfile)
      }
    }

    // Session stability — continue existing ranked snapshot
    if (input.sessionToken && !input.refresh) {
      const existing = feedSessionService.decode(input.sessionToken)
      if (existing && existing.mode === input.mode && existing.rankedIds.length) {
        const { ids, nextPayload, hasMore } = feedSessionService.slicePage(existing, input.limit)
        const rows = await feedCandidateService.fetchByIds(ids)
        const ordered = feedSessionService.reorderBySession(rows, existing)
        const scored = feedScoringService.scoreAll(ordered, ctx, input.mode, input.seenArticles, input.seenClusters)
        return {
          ranked: scored,
          session: nextPayload ?? existing,
          sessionToken: nextPayload ? feedSessionService.encode(nextPayload) : input.sessionToken,
          rankingVersion: FEED_RANKING_VERSION,
          candidateCounts: { session_resume: ids.length, hasMore: hasMore ? 1 : 0 },
        }
      }
    }

    // 3. Fetch candidate pools
    const pools = await fetchPools(input.mode, {
      limit: input.limit * 4,
      userId: input.userId,
      citySlug: input.citySlug,
      districtSlug: input.districtSlug,
      region: input.region,
      excludeArticleIds: input.seenArticles,
      excludeClusterIds: input.seenClusters,
    })
    const candidateCounts = countPools(pools)

    // 4. Flatten + select cluster representatives
    const flat = flattenPools(pools)
    const reps = feedRepresentativeSelector.select(flat)

    // 5. Score candidates
    const scored = feedScoringService.scoreAll(reps, ctx, input.mode, input.seenArticles, input.seenClusters)

    // 6. Diversity rerank
    const diversified = feedDiversityEngine.rerank(scored, input.mode, Math.max(input.limit * 3, input.limit))

    // 7. Seen / negative penalties already applied in scoring

    // 8. Create session snapshot for stability
    const rankedIds = diversified.map((r) => r.articleId)
    const session = feedSessionService.create(input.mode, rankedIds)
    const sessionToken = feedSessionService.encode(session)

    // 9. Paginate first page
    const { ids } = feedSessionService.slicePage(session, input.limit)
    const pageRows = diversified.filter((r) => ids.includes(r.articleId))
    const orderedPage = feedSessionService.reorderBySession(pageRows, session)

    return {
      ranked: orderedPage,
      session: { ...session, offset: ids.length },
      sessionToken: feedSessionService.encode({ ...session, offset: ids.length }),
      rankingVersion: FEED_RANKING_VERSION,
      candidateCounts,
    }
  }
}

export const feedRankingPipeline = new FeedRankingPipeline()
