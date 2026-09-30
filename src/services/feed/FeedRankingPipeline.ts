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
import { getFeedAlgorithmOps } from '@/services/feed/feedAlgorithmOps.server'
import { feedSeenService } from './FeedSeenService'
import { emptySessionIntent, nfRankEngine, type NfSessionIntent } from './nfRank/NFRankEngine'
import { compareShadowRankings } from './nfRank/nfRankShadowCompare'
import {
  MAX_EXTRA_LOCAL_CITIES,
  applyPersonalLocationToContext,
  filterPersonalLocalInventory,
  personalLocalScopeFromContext,
} from '@/lib/feed/personalLocalScope'

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
  /** City tenant — local corpus only (no national personal mix). */
  lockCity?: boolean
  seenArticles: Set<string>
  seenClusters: Set<string>
  /** Feed V2 NFRank: off | shadow (eval only) | live (visible order). */
  nfRankMode?: NfRankPipelineMode
  sessionIntent?: NfSessionIntent
  /** Admin-promoted topics (bounded). */
  boostTopics?: readonly string[]
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
    lockCity?: boolean
    extraCitySlugs?: readonly string[]
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

  if (opts.lockCity && opts.citySlug) {
    const local = await feedCandidateService.fetchLocal({
      ...base,
      limit: Math.max(opts.limit, limits.LOCAL),
    })
    return { LOCAL: local }
  }

  if (mode === 'personal') {
    const extraSlugs = (opts.extraCitySlugs ?? []).filter(
      (slug) => slug && slug !== (opts.citySlug ?? '').trim().toLowerCase()
    )
    const [featured, breaking, recent, popular, local, extraLocal, discovery, following] =
      await Promise.all([
        feedCandidateService.fetchFeatured({ ...base, limit: limits.FEATURED }),
        feedCandidateService.fetchBreaking({ ...base, limit: limits.BREAKING }),
        feedCandidateService.fetchRecent({ ...base, limit: limits.RECENT }),
        feedCandidateService.fetchPopular({ ...base, limit: limits.POPULAR }),
        feedCandidateService.fetchLocal({ ...base, limit: limits.LOCAL }),
        Promise.all(
          extraSlugs.slice(0, MAX_EXTRA_LOCAL_CITIES).map((slug) =>
            feedCandidateService.fetchLocal({
              ...base,
              citySlug: slug,
              districtSlug: null,
              limit: Math.min(limits.LOCAL, 40),
            })
          )
        ),
        feedCandidateService.fetchDiscovery({ ...base, limit: limits.DISCOVERY }),
        opts.userId ? feedCandidateService.fetchFollowing({ ...base, limit: limits.FOLLOWING }) : Promise.resolve([]),
      ])
    return {
      FEATURED: featured,
      BREAKING: breaking,
      RECENT: recent,
      POPULAR: popular,
      LOCAL: [...local, ...extraLocal.flat()],
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

/** Ignore a lone old popular card so the next page does not jump a month. */
function continuationOlderThan(
  ranked: Array<{ publishedAt: Date }>,
  previous: string | null | undefined
): string | null {
  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000
  const recent = ranked.filter((row) => row.publishedAt.getTime() >= cutoff)
  const pool = recent.length >= 8 ? recent : ranked
  return oldestPublishedIso(pool) ?? previous ?? null
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
  coldStart = false,
  boostTopics: readonly string[] = []
): { ranked: ScoredFeedCandidate[]; shadowComparison?: ReturnType<typeof compareShadowRankings> } {
  const reps = feedRepresentativeSelector.select(flat)
  const windowLimit = Math.max(limit * 3, limit)

  if (nfRankMode === 'live') {
    const ranked = nfRankEngine.compose(reps, ctx, mode, windowLimit, sessionIntent, {
      seenArticles,
      seenClusters,
      coldStart,
      boostTopics,
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
      boostTopics,
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
    const scope = personalLocalScopeFromContext(ctx, input.citySlug)
    const extraCitySlugs = [...scope.extraCities]
    // First page stays unscoped so unseen recent cards are still eligible.
    // A continuation must use the time bound: served ids were compacted out of
    // the session, and an unscoped fetch replays the same head until the
    // client stalls on the last card.
    let pools = await fetchPools(input.mode, {
      limit: input.limit * 4,
      userId: input.userId,
      citySlug: input.citySlug ?? scope.homeCity,
      districtSlug: input.districtSlug,
      region: input.region,
      lockCity: input.lockCity,
      extraCitySlugs,
      excludeArticleIds,
      excludeClusterIds: input.seenClusters,
      publishedBefore: publishedBefore ?? null,
    })
    let flat = filterPersonalLocalInventory(flattenPools(pools), input.mode, scope)
    let candidateCounts = countPools(pools)

    if (flat.length < input.limit && publishedBefore) {
      pools = await fetchPools(input.mode, {
        limit: input.limit * 4,
        userId: input.userId,
        citySlug: input.citySlug ?? scope.homeCity,
        districtSlug: input.districtSlug,
        region: input.region,
        lockCity: input.lockCity,
        extraCitySlugs,
        excludeArticleIds,
        excludeClusterIds: input.seenClusters,
        publishedBefore,
      })
      const boundFlat = filterPersonalLocalInventory(flattenPools(pools), input.mode, scope)
      candidateCounts = { ...candidateCounts, ...countPools(pools), older_bound: boundFlat.length }
      const seen = new Set(flat.map((r) => r.articleId))
      for (const row of boundFlat) {
        if (seen.has(row.articleId) || excludeArticleIds.has(row.articleId)) continue
        seen.add(row.articleId)
        flat.push(row)
      }
    }

    // Tier: older LEGACY_ALLOWED when recent/canonical pools underfill after exclusions.
    // LOCAL / city-tenant lock must NEVER nationwide-fill — that leaked Kozinoğlu into Çanakkale.
    if (flat.length < input.limit && input.mode !== 'local' && !input.lockCity) {
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
      for (const row of filterPersonalLocalInventory(older, input.mode, scope)) {
        if (seen.has(row.articleId) || excludeArticleIds.has(row.articleId)) continue
        seen.add(row.articleId)
        flat.push(row)
      }
    } else if (flat.length < input.limit && (input.mode === 'local' || input.lockCity)) {
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
      coldStart,
      input.boostTopics ?? []
    )
    const olderThan = continuationOlderThan(ranked, publishedBefore)
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
      const seed = new Set<string>([
        ...input.seenArticles,
        ...working.rankedIds,
        ...(working.servedIds ?? []),
      ])
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
      const exhausted = nextPayload.corpusExhausted === true
      return {
        ranked: [],
        session: { ...nextPayload, corpusExhausted: exhausted },
        sessionToken: feedSessionService.encode({ ...nextPayload, corpusExhausted: exhausted }),
        rankingVersion,
        candidateCounts: { ...candidateCounts, session_resume: 0, hasMore: exhausted ? 0 : 1 },
      }
    }

    const rows = await feedCandidateService.fetchByIds(ids)
    // nextPayload only keeps unread ids. Order this page from the snapshot
    // that still contains the ids we just sliced.
    const ordered = feedSessionService.reorderBySession(rows, working)
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
    const ops = await getFeedAlgorithmOps()
    const resolved: RankingPipelineInput = {
      ...input,
      boostTopics: input.boostTopics ?? ops.boostTopics,
    }
    const nfMode = resolved.nfRankMode ?? 'off'
    const rankingVersion =
      nfMode === 'live' ? NFRANK_VERSION : FEED_RANKING_VERSION

    // 1. Load user context (exclude SYNTHETIC_TEST)
    let ctx: FeedUserContext = await feedUserContextService.load(resolved.userId)
    if (ctx.isSynthetic) ctx = { ...ctx, explicitInterests: [], behavioralInterests: new Map(), followedPublisherIds: new Set() }

    // 2. On-demand behavioral aggregation (bounded, authed only)
    // Shadow NFRank must not mutate interests from hypothetical results — only real aggregator on real events.
    if (resolved.userId && !ctx.isSynthetic && !resolved.sessionToken) {
      await feedInterestAggregator.aggregateForUser(resolved.userId).catch(() => {})
      ctx = await feedUserContextService.load(resolved.userId)
    }

    ctx = applyPersonalLocationToContext(ctx, resolved.citySlug, resolved.districtSlug)
    resolved.citySlug = resolved.citySlug || ctx.city
    resolved.districtSlug = resolved.districtSlug || ctx.districtSlug

    // Session stability — continue / refill existing ranked snapshot (current + near cards frozen via rankedIds)
    if (resolved.sessionToken && !resolved.refresh) {
      const existing = feedSessionService.decode(resolved.sessionToken)
      if (existing && existing.mode === resolved.mode) {
        return this.pageFromSession(existing, resolved, ctx, rankingVersion, {
          session_continue: 1,
        })
      }
    }

    // 2b. Cold Start V2 — when NFRank live, reuse cold-start detection but score via NFRank (no fake personalization)
    const coldStartAllowed = await isColdStartEffectiveForUser(resolved.userId)
    let coldStart = false
    if (coldStartAllowed && resolved.mode === 'personal' && !resolved.sessionToken) {
      const coldProfile = feedColdStartService.resolveProfile(ctx)
      if (coldProfile) {
        if (nfMode === 'live') {
          coldStart = true
        } else {
          return feedColdStartService.buildFeed(resolved, ctx, coldProfile)
        }
      }
    }

    // 3–6. First window
    const exclude = await feedSeenService.expandArticleIdentities(new Set(resolved.seenArticles))
    const { ranked: diversified, candidateCounts, olderThan, shadowComparison } = await this.buildNextWindow(
      resolved,
      ctx,
      exclude,
      null,
      coldStart
    )

    const rankedIds = diversified.map((r) => r.articleId)
    const session = feedSessionService.create(resolved.mode, rankedIds, undefined, {
      olderThan,
      generation: 0,
      corpusExhausted: rankedIds.length === 0,
    })

    const page = await this.pageFromSession(session, resolved, ctx, rankingVersion, candidateCounts)
    return { ...page, nfShadowComparison: shadowComparison }
  }
}

export const feedRankingPipeline = new FeedRankingPipeline()
