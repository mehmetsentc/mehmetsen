import 'server-only'

import type { FeedCandidateRow, FeedCandidateSource, FeedMode, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'
import { FEED_RANKING_CONFIG_V1, FEED_RANKING_VERSION } from '@/lib/feed/rankingConfig'
import { NFRANK_VERSION } from '@/lib/feed/nfRankConfig'
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
import { emptySessionIntent, nfRankEngine, type NfSessionIntent } from './nfRank/NFRankEngine'
import { compareShadowRankings } from './nfRank/nfRankShadowCompare'

export type NfRankPipelineMode = 'off' | 'shadow' | 'live'

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
  /** Feed V2 NFRank: off | shadow (eval only) | live (visible order). */
  nfRankMode?: NfRankPipelineMode
  sessionIntent?: NfSessionIntent
}

export interface RankingPipelineResult {
  ranked: ScoredFeedCandidate[]
  session: FeedSessionPayload
  sessionToken: string
  rankingVersion: string
  candidateCounts: Record<string, number>
  nfShadowComparison?: ReturnType<typeof compareShadowRankings>
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
  const byId = new Map<string, FeedCandidateRow>()
  for (const [sourceKey, pool] of Object.entries(pools) as Array<[FeedCandidateSource, FeedCandidateRow[] | undefined]>) {
    for (const row of pool ?? []) {
      const existing = byId.get(row.articleId)
      if (existing) {
        const sources = new Set<FeedCandidateSource>([
          ...(existing.candidateSources ?? [existing.source]),
          sourceKey,
          row.source,
        ])
        existing.candidateSources = [...sources]
        continue
      }
      byId.set(row.articleId, {
        ...row,
        candidateSources: [...new Set<FeedCandidateSource>([row.source, sourceKey])],
      })
    }
  }
  return [...byId.values()]
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
  limit: number,
  nfRankMode: NfRankPipelineMode = 'off',
  sessionIntent: NfSessionIntent = emptySessionIntent(),
  coldStart = false
): { ranked: ScoredFeedCandidate[]; shadowComparison?: ReturnType<typeof compareShadowRankings> } {
  const reps = feedRepresentativeSelector.select(flat)
  const windowLimit = Math.max(limit * 3, limit)

  if (nfRankMode === 'live') {
    const ranked = nfRankEngine.compose(reps, ctx, mode, windowLimit, sessionIntent, {
      seenArticles,
      seenClusters,
      coldStart,
    })
    return { ranked }
  }

  const scored = feedScoringService.scoreAll(reps, ctx, mode, seenArticles, seenClusters)
  const ranked = feedDiversityEngine.rerank(scored, mode, windowLimit)

  if (nfRankMode === 'shadow') {
    const shadow = nfRankEngine.compose(reps, ctx, mode, windowLimit, sessionIntent, {
      seenArticles,
      seenClusters,
      coldStart,
    })
    const shadowComparison = compareShadowRankings({
      baseline: ranked,
      shadow,
      baselineVersion: FEED_RANKING_VERSION,
      seenArticles,
      seenClusters,
    })
    // Shadow must not affect visible order or profiles — log only.
    if (process.env.NODE_ENV !== 'test') {
      console.info('[nfrank-shadow]', JSON.stringify({
        verdict: shadowComparison.verdict,
        topOverlap: shadowComparison.topOverlap,
        baselineClusterDupes: shadowComparison.baselineClusterDupes,
        shadowClusterDupes: shadowComparison.shadowClusterDupes,
        seenViolationsShadow: shadowComparison.seenViolationsShadow,
      }))
    }
    return { ranked, shadowComparison }
  }

  return { ranked }
}

export class FeedRankingPipeline {
  /** Build / append a bounded ranked window excluding already-served + seen IDs. */
  private async buildNextWindow(
    input: RankingPipelineInput,
    ctx: FeedUserContext,
    excludeArticleIds: Set<string>,
    publishedBefore: string | null | undefined,
    coldStart = false
  ): Promise<{
    ranked: ScoredFeedCandidate[]
    candidateCounts: Record<string, number>
    olderThan: string | null
    shadowComparison?: ReturnType<typeof compareShadowRankings>
  }> {
    // Exclude served IDs in SQL (see fetchRecent) — do not time-gate first, so
    // remaining unseen recent inventory is consumed before older fallback.
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

    if (flat.length < input.limit && publishedBefore) {
      pools = await fetchPools(input.mode, {
        limit: input.limit * 4,
        userId: input.userId,
        citySlug: input.citySlug,
        districtSlug: input.districtSlug,
        region: input.region,
        excludeArticleIds,
        excludeClusterIds: input.seenClusters,
        publishedBefore,
      })
      const boundFlat = flattenPools(pools)
      candidateCounts = { ...candidateCounts, ...countPools(pools), older_bound: boundFlat.length }
      const seen = new Set(flat.map((r) => r.articleId))
      for (const row of boundFlat) {
        if (seen.has(row.articleId) || excludeArticleIds.has(row.articleId)) continue
        seen.add(row.articleId)
        flat.push(row)
      }
    }

    // Tier: older LEGACY_ALLOWED when recent/canonical pools underfill after exclusions.
    // LOCAL mode must NEVER nationwide-fill — that made Eskişehir appear in Antalya Yerel.
    if (flat.length < input.limit && input.mode !== 'local') {
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
    } else if (flat.length < input.limit && input.mode === 'local') {
      candidateCounts.LOCAL_NO_NATIONWIDE_FILL = 1
    }

    const { ranked, shadowComparison } = rankWindow(
      flat,
      ctx,
      input.mode,
      input.seenArticles,
      input.seenClusters,
      input.limit,
      input.nfRankMode ?? 'off',
      input.sessionIntent ?? emptySessionIntent(),
      coldStart
    )
    const olderThan = oldestPublishedIso(ranked) ?? publishedBefore ?? null
    return { ranked, candidateCounts, olderThan, shadowComparison }
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
    // Up to 3 refill passes so a thin window (dupes / sparse FS batch) does not stall the feed.
    let refillPasses = 0
    while (
      working.rankedIds.length - (working.offset ?? 0) < input.limit &&
      !working.corpusExhausted &&
      refillPasses < 3
    ) {
      refillPasses += 1
      const seed = new Set<string>([...input.seenArticles, ...working.rankedIds])
      const exclude = await feedSeenService.expandArticleIdentities(seed)
      // Prefer time-cursor past the oldest served item so SQL can skip the head of the table.
      const olderBound = working.olderThan ?? null
      const { ranked, candidateCounts: counts, olderThan } = await this.buildNextWindow(
        input,
        ctx,
        exclude,
        olderBound
      )
      candidateCounts = {
        ...candidateCounts,
        ...counts,
        session_refill: (candidateCounts.session_refill ?? 0) + ranked.length,
      }
      const newIds = ranked.map((r) => r.articleId)
      const beforeLen = working.rankedIds.length - (working.offset ?? 0)
      working = feedSessionService.appendWindow(working, newIds, olderThan)
      if (newIds.length === 0 || working.corpusExhausted) {
        // Second chance: pure recent walk without publishedBefore gate (exclude-only).
        const retry = await this.buildNextWindow(input, ctx, exclude, null)
        const retryIds = retry.ranked.map((r) => r.articleId)
        working = feedSessionService.appendWindow(working, retryIds, retry.olderThan)
        candidateCounts.session_refill_retry =
          (candidateCounts.session_refill_retry ?? 0) + retryIds.length
        if (retryIds.length === 0) {
          working = { ...working, corpusExhausted: true }
          break
        }
      }
      const afterLen = working.rankedIds.length - (working.offset ?? 0)
      // No net growth → stop spinning even if corpusExhausted stayed false.
      if (afterLen <= beforeLen) break
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
    const nfMode = input.nfRankMode ?? 'off'
    const rankingVersion =
      nfMode === 'live' ? NFRANK_VERSION : FEED_RANKING_VERSION

    // 1. Load user context (exclude SYNTHETIC_TEST)
    let ctx: FeedUserContext = await feedUserContextService.load(input.userId)
    if (ctx.isSynthetic) ctx = { ...ctx, explicitInterests: [], behavioralInterests: new Map(), followedPublisherIds: new Set() }

    // 2. On-demand behavioral aggregation (bounded, authed only)
    // Shadow NFRank must not mutate interests from hypothetical results — only real aggregator on real events.
    if (input.userId && !ctx.isSynthetic && !input.sessionToken) {
      await feedInterestAggregator.aggregateForUser(input.userId).catch(() => {})
      ctx = await feedUserContextService.load(input.userId)
    }

    // Session stability — continue / refill existing ranked snapshot (current + near cards frozen via rankedIds)
    if (input.sessionToken && !input.refresh) {
      const existing = feedSessionService.decode(input.sessionToken)
      if (existing && existing.mode === input.mode) {
        return this.pageFromSession(existing, input, ctx, rankingVersion, {
          session_continue: 1,
        })
      }
    }

    // 2b. Cold Start V2 — when NFRank live, reuse cold-start detection but score via NFRank (no fake personalization)
    const coldStartAllowed = await isColdStartEffectiveForUser(input.userId)
    let coldStart = false
    if (coldStartAllowed && input.mode === 'personal' && !input.sessionToken) {
      const coldProfile = feedColdStartService.resolveProfile(ctx)
      if (coldProfile) {
        if (nfMode === 'live') {
          coldStart = true
        } else {
          return feedColdStartService.buildFeed(input, ctx, coldProfile)
        }
      }
    }

    // 3–6. First window
    const exclude = await feedSeenService.expandArticleIdentities(new Set(input.seenArticles))
    const { ranked: diversified, candidateCounts, olderThan, shadowComparison } = await this.buildNextWindow(
      input,
      ctx,
      exclude,
      null,
      coldStart
    )

    const rankedIds = diversified.map((r) => r.articleId)
    const session = feedSessionService.create(input.mode, rankedIds, undefined, {
      olderThan,
      generation: 0,
      corpusExhausted: rankedIds.length === 0,
    })

    const page = await this.pageFromSession(session, input, ctx, rankingVersion, candidateCounts)
    return { ...page, nfShadowComparison: shadowComparison }
  }
}

export const feedRankingPipeline = new FeedRankingPipeline()
