import 'server-only'

import { and, eq, inArray, or } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { articleLikes, savedArticles } from '@/db/schema/socialGraph'
import { publisherSources, publishers } from '@/db/schema/publishers'
import { FEED_PAGINATION } from '@/lib/feed/config'
import { isSmartFeedRankingEffectiveForUser, isNfRankLiveEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { FEED_RANKING_VERSION } from '@/lib/feed/rankingConfig'
import { NFRANK_VERSION } from '@/lib/feed/nfRankConfig'
import { isNfRankShadowEnabled } from '@/lib/feed/featureFlag'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'
import { isFollowablePublisherId } from '@/lib/feed/feedIdentity'
import { resolveCategoryFilterIds } from '@/lib/feed/resolveCategoryFilterIds'
import type {
  FeedCandidateRow,
  FeedItemDto,
  FeedMode,
  FeedPageDto,
  FeedSocialState,
  FeedSurface,
  ScoredFeedCandidate,
} from '@/types/smartFeed'
import { decodeFeedCursor, encodeFeedCursor } from './feedUtils'
import { feedCandidateService } from './FeedCandidateService'
import { feedRankingPipeline, type NfRankPipelineMode } from './FeedRankingPipeline'
import { feedRankingV1 } from './FeedRankingV1'
import { feedSeenService } from './FeedSeenService'
import { feedTelemetryService } from './FeedTelemetryService'

export interface FeedRequestContext {
  userId: string | null
  sessionId: string | null
  mode: FeedMode
  cursor?: string | null
  limit?: number
  citySlug?: string | null
  districtSlug?: string | null
  region?: string | null
  refresh?: boolean
  /** When set, restrict corpus to this category (+ children). */
  category?: string | null
  /** Isolation: NFRank only when surface === 'feed-v2'. */
  surface?: FeedSurface
}

function clampLimit(limit?: number): number {
  const n = limit ?? FEED_PAGINATION.defaultLimit
  return Math.min(Math.max(n, FEED_PAGINATION.minLimit), FEED_PAGINATION.maxLimit)
}

async function resolveNfRankMode(ctx: FeedRequestContext): Promise<NfRankPipelineMode> {
  // Hard isolation: never activate outside /feed-v2
  if (ctx.surface !== 'feed-v2') return 'off'
  const live = await isNfRankLiveEffectiveForUser(ctx.userId)
  if (live) return 'live'
  if (isNfRankShadowEnabled()) return 'shadow'
  return 'off'
}

function toDto(row: FeedCandidateRow | ScoredFeedCandidate, social?: FeedSocialState | null, debug?: boolean): FeedItemDto {
  const scored = 'score' in row ? row : null
  const rawSlug = row.publisherSlug ?? null
  const idAsSlug =
    row.publisherId && isPublisherProfileSlug(row.publisherId) ? row.publisherId.trim().toLowerCase() : null
  const linkableSlug = isPublisherProfileSlug(rawSlug)
    ? rawSlug!.trim().toLowerCase()
    : idAsSlug
  return {
    id: row.articleId,
    type: 'article',
    articleId: row.articleId,
    clusterId: row.clusterId,
    publisher: (row.publisherId || row.publisherName)
      ? {
          id: isFollowablePublisherId(row.publisherId)
            ? (row.publisherId as string)
            : linkableSlug && isFollowablePublisherId(linkableSlug)
              ? linkableSlug
              : 'source',
          // Empty slug → card renders name without /publisher link (avoids 404).
          slug: linkableSlug ?? '',
          name: row.publisherName ?? 'Kaynak',
          logoUrl: row.publisherLogoUrl,
        }
      : null,
    headline: row.headline,
    summary: row.summary,
    category: row.category,
    image: row.image,
    video: row.video,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    breaking: row.breaking,
    materialUpdate: row.materialUpdate,
    clusterSourceCount: row.clusterSourceCount,
    socialState: social ?? null,
    socialCounts: {
      likes: row.likesCount,
      comments: row.commentsCount,
      saves: row.savesCount,
      shares: row.sharesCount,
    },
    reason: scored?.reason ?? row.source,
    scoreBreakdown: debug && scored ? scored.breakdown : undefined,
    slug: row.slug,
  }
}

async function loadSocialState(userId: string | null, articleIds: string[]): Promise<Map<string, FeedSocialState>> {
  const map = new Map<string, FeedSocialState>()
  if (!userId || !articleIds.length || !hasDatabaseUrl()) return map

  try {
    const db = getDb()
    const [likes, saves] = await Promise.all([
      db
        .select({ articleId: articleLikes.articleId })
        .from(articleLikes)
        .where(and(eq(articleLikes.userId, userId), inArray(articleLikes.articleId, articleIds))),
      db
        .select({ articleId: savedArticles.articleId })
        .from(savedArticles)
        .where(and(eq(savedArticles.userId, userId), inArray(savedArticles.articleId, articleIds))),
    ])

    const liked = new Set(likes.map((l) => l.articleId))
    const saved = new Set(saves.map((s) => s.articleId))
    for (const id of articleIds) {
      map.set(id, { liked: liked.has(id), saved: saved.has(id) })
    }
  } catch {
    // Graceful fallback if social state query is unavailable
  }
  return map
}

/**
 * Fill missing publisherSlug so feed cards can link to /publisher/[slug].
 * Resolves publishers.id and publisher_sources.sourceId → publishers.slug.
 */
async function enrichPublisherSlugs<T extends FeedCandidateRow | ScoredFeedCandidate>(
  rows: T[]
): Promise<T[]> {
  if (!rows.length || !hasDatabaseUrl()) return rows

  const needKeys = new Set<string>()
  for (const row of rows) {
    if (isPublisherProfileSlug(row.publisherSlug)) continue
    if (row.publisherId?.trim()) needKeys.add(row.publisherId.trim())
  }
  if (!needKeys.size) return rows

  try {
    const db = getDb()
    const keys = [...needKeys]
    const found = await db
      .select({
        id: publishers.id,
        slug: publishers.slug,
        sourceId: publisherSources.sourceId,
      })
      .from(publishers)
      .leftJoin(publisherSources, eq(publisherSources.publisherId, publishers.id))
      .where(or(inArray(publishers.id, keys), inArray(publisherSources.sourceId, keys)))

    const slugByKey = new Map<string, string>()
    for (const row of found) {
      if (!isPublisherProfileSlug(row.slug)) continue
      const slug = row.slug.trim().toLowerCase()
      slugByKey.set(row.id, slug)
      if (row.sourceId) slugByKey.set(row.sourceId, slug)
    }
    if (!slugByKey.size) return rows

    return rows.map((row) => {
      if (isPublisherProfileSlug(row.publisherSlug)) return row
      const key = row.publisherId?.trim()
      if (!key) return row
      const slug = slugByKey.get(key)
      if (!slug) return row
      return { ...row, publisherSlug: slug }
    })
  } catch {
    return rows
  }
}

export class FeedService {
  async getFeed(ctx: FeedRequestContext, opts?: { debug?: boolean }): Promise<FeedPageDto> {
    const limit = clampLimit(ctx.limit)
    const feedType = ctx.mode
    const rankingEnabled = await isSmartFeedRankingEffectiveForUser(ctx.userId)
    const nfRankMode = rankingEnabled ? await resolveNfRankMode(ctx) : 'off'
    const cursorPayload = decodeFeedCursor(ctx.cursor)
    const sessionToken = cursorPayload?.session ?? null

    if (ctx.mode === 'following' && !ctx.userId) {
      return { items: [], nextCursor: null, hasMore: false, mode: ctx.mode, emptyReason: 'auth_required' }
    }

    // Yerel: city/district zorunlu — konum yoksa ulusal/fallback karışım dönme.
    if (
      ctx.mode === 'local' &&
      !ctx.category &&
      !ctx.citySlug?.trim() &&
      !ctx.districtSlug?.trim() &&
      !ctx.region?.trim()
    ) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        mode: ctx.mode,
        emptyReason: 'location_required',
        rankingVersion: 'local_geo_v1',
      }
    }

    const telemetryRankingVersion =
      nfRankMode === 'live' ? NFRANK_VERSION : rankingEnabled ? FEED_RANKING_VERSION : 'mix_v1'

    await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
      {
        eventType: 'feed_request',
        feedType: ctx.mode,
        metadata: {
          ranking_version: telemetryRankingVersion,
          nf_rank_mode: nfRankMode,
          feed_surface: ctx.surface ?? 'other',
          feedSessionId: sessionToken ? 'present' : 'new',
        },
      },
    ])

    try {
      const timeCursor =
        cursorPayload?.publishedAt && cursorPayload?.id
          ? { publishedAt: cursorPayload.publishedAt, id: cursorPayload.id }
          : null
      const categoryIds = ctx.category ? resolveCategoryFilterIds(ctx.category) : null
      const candidateOpts = {
        limit: limit * 3,
        cursor: timeCursor,
        cursorRaw: ctx.cursor,
        citySlug: ctx.citySlug,
        districtSlug: ctx.districtSlug,
        region: ctx.region,
        userId: ctx.userId,
        category: ctx.category ?? null,
        categoryIds,
      }

      // Category tab: prefer unseen, then soft-walk older (incl. previously seen in other modes)
      // so sparse categories still infinite-scroll until the corpus is truly empty.
      if (ctx.category) {
        const previewRows = await feedCandidateService.fetchRecent({
          ...candidateOpts,
          cursor: timeCursor,
        })
        const clusterIds = previewRows.map((r) => r.clusterId).filter((id): id is string => Boolean(id))
        const { seenArticles, seenClusters } = await feedSeenService.filterSuppressible(
          ctx.userId,
          ctx.sessionId,
          `category:${ctx.category}`,
          clusterIds
        )

        const collectRanked = async (
          excludeArticleIds: Set<string> | undefined,
          excludeClusterIds: Set<string> | undefined,
          cursor: typeof timeCursor
        ): Promise<FeedCandidateRow[]> => {
          const opts = {
            ...candidateOpts,
            cursor,
            excludeArticleIds,
            excludeClusterIds,
          }
          if (cursor) {
            return feedRankingV1.rankMode(
              'personal',
              await feedCandidateService.fetchRecent(opts),
              limit
            )
          }
          const [recent, popular, featured] = await Promise.all([
            feedCandidateService.fetchRecent(opts),
            feedCandidateService.fetchPopular(opts),
            feedCandidateService.fetchFeatured(opts),
          ])
          return feedRankingV1.rankPersonal(
            {
              BREAKING: [],
              RECENT: recent,
              POPULAR: popular,
              LOCAL: [],
              DISCOVERY: featured,
              FOLLOWING: [],
            },
            limit,
            false
          )
        }

        let ranked = await collectRanked(seenArticles, seenClusters, timeCursor)

        // Soft refill: drop cross-mode seen exclusions and walk older by cursor.
        if (ranked.length < limit) {
          const have = new Set(ranked.map((r) => r.articleId))
          let walkCursor =
            timeCursor ??
            (ranked.length
              ? {
                  publishedAt: ranked[ranked.length - 1]!.publishedAt.toISOString(),
                  id: ranked[ranked.length - 1]!.articleId,
                }
              : null)

          for (let walk = 0; walk < 8 && ranked.length < limit; walk++) {
            const older = await feedCandidateService.fetchRecent({
              ...candidateOpts,
              cursor: walkCursor,
              // Only skip rows already on this page — allow category re-browse of older/seen.
              excludeArticleIds: have,
              excludeClusterIds: undefined,
            })
            if (!older.length) break

            for (const row of older) {
              if (have.has(row.articleId)) continue
              have.add(row.articleId)
              ranked.push(row)
              if (ranked.length >= limit) break
            }

            const lastOlder = older[older.length - 1]!
            walkCursor = {
              publishedAt: lastOlder.publishedAt.toISOString(),
              id: lastOlder.articleId,
            }
            // Thin older page → likely near end of category corpus.
            if (older.length < Math.max(3, Math.floor(limit / 2))) break
          }
          ranked = ranked.slice(0, limit)
        }

        if (!ranked.length) {
          return {
            items: [],
            nextCursor: null,
            hasMore: false,
            mode: ctx.mode,
            emptyReason: 'no_items',
            rankingVersion: 'category_mix_v1',
          }
        }

        const articleIds = ranked.map((r) => r.articleId)
        const [socialMap, enriched] = await Promise.all([
          loadSocialState(ctx.userId, articleIds),
          enrichPublisherSlugs(ranked),
        ])
        const items = enriched.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))
        const last = ranked[ranked.length - 1]!
        const pageCursor = {
          publishedAt: last.publishedAt.toISOString(),
          id: last.articleId,
        }
        // Probe one step older so short first pages don't falsely end the feed.
        const olderProbe = await feedCandidateService.fetchRecent({
          ...candidateOpts,
          cursor: pageCursor,
          excludeArticleIds: new Set(articleIds),
          excludeClusterIds: undefined,
          limit: Math.max(limit, 8),
        })
        const hasMore = olderProbe.length > 0

        return {
          items,
          nextCursor: hasMore ? encodeFeedCursor(pageCursor) : null,
          hasMore,
          mode: ctx.mode,
          rankingVersion: 'category_mix_v1',
        }
      }

      const previewRows = await feedCandidateService.fetchForMode(ctx.mode, candidateOpts)
      const clusterIds = previewRows.map((r) => r.clusterId).filter((id): id is string => Boolean(id))
      const { seenArticles, seenClusters } = await feedSeenService.filterSuppressible(
        ctx.userId,
        ctx.sessionId,
        feedType,
        clusterIds
      )

      const suppressOpts = {
        ...candidateOpts,
        excludeArticleIds: seenArticles,
        excludeClusterIds: seenClusters,
      }

      if (rankingEnabled) {
        const pipelineResult = await feedRankingPipeline.run({
          userId: ctx.userId,
          mode: ctx.mode,
          limit,
          cursor: ctx.cursor,
          sessionToken,
          refresh: ctx.refresh ?? !ctx.cursor,
          citySlug: ctx.citySlug,
          districtSlug: ctx.districtSlug,
          region: ctx.region,
          seenArticles,
          seenClusters,
          nfRankMode,
        })

        const ranked = pipelineResult.ranked
        if (!ranked.length) {
          const mayHaveMore = pipelineResult.session.corpusExhausted !== true
          await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
            { eventType: 'feed_empty', feedType: ctx.mode, metadata: { ranking_version: pipelineResult.rankingVersion } },
          ])
          return {
            items: [],
            nextCursor:
              mayHaveMore && pipelineResult.sessionToken
                ? encodeFeedCursor({
                    publishedAt: new Date(0).toISOString(),
                    id: 'resume',
                    session: pipelineResult.sessionToken,
                    offset: pipelineResult.session.offset,
                  })
                : null,
            hasMore: mayHaveMore,
            mode: ctx.mode,
            emptyReason: mayHaveMore ? undefined : 'no_items',
            rankingVersion: pipelineResult.rankingVersion,
            feedSessionId: pipelineResult.session.sessionId,
          }
        }

        const articleIds = ranked.map((r) => r.articleId)
        const [socialMap, enriched] = await Promise.all([
          loadSocialState(ctx.userId, articleIds),
          enrichPublisherSlugs(ranked),
        ])
        const items = enriched.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))

        const last = ranked[ranked.length - 1]
        const nextCursor = pipelineResult.sessionToken
          ? encodeFeedCursor({
              publishedAt: last.publishedAt.toISOString(),
              id: last.articleId,
              session: pipelineResult.sessionToken,
              offset: pipelineResult.session.offset,
            })
          : encodeFeedCursor({ publishedAt: last.publishedAt.toISOString(), id: last.articleId })

        const atEnd =
          pipelineResult.session.offset >= pipelineResult.session.rankedIds.length
        const hasMore =
          !atEnd || pipelineResult.session.corpusExhausted !== true

        return {
          items,
          nextCursor: hasMore ? nextCursor : null,
          hasMore,
          mode: ctx.mode,
          rankingVersion: pipelineResult.rankingVersion,
          feedSessionId: pipelineResult.session.sessionId,
        }
      }

      let ranked: FeedCandidateRow[] = []

      if (ctx.mode === 'personal' && timeCursor) {
        // Append pages: walk recent corpus by cursor (remixing the head would stall ~1–2 pages).
        const rows = await feedCandidateService.fetchRecent(suppressOpts)
        ranked = feedRankingV1.rankMode(ctx.mode, rows, limit)
      } else if (ctx.mode === 'personal') {
        const [breaking, recent, popular, local, discovery, following] = await Promise.all([
          feedCandidateService.fetchBreaking(suppressOpts),
          feedCandidateService.fetchRecent(suppressOpts),
          feedCandidateService.fetchPopular(suppressOpts),
          feedCandidateService.fetchLocal(suppressOpts),
          feedCandidateService.fetchDiscovery(suppressOpts),
          ctx.userId ? feedCandidateService.fetchFollowing(suppressOpts) : Promise.resolve([]),
        ])
        ranked = feedRankingV1.rankPersonal(
          { BREAKING: breaking, RECENT: recent, POPULAR: popular, LOCAL: local, DISCOVERY: discovery, FOLLOWING: following },
          limit,
          Boolean(ctx.userId && following.length)
        )
      } else {
        const rows = await feedCandidateService.fetchForMode(ctx.mode, suppressOpts)
        ranked = feedRankingV1.rankMode(ctx.mode, rows, limit)
      }

      if (!ranked.length) {
        await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
          { eventType: 'feed_empty', feedType: ctx.mode },
        ])
        return { items: [], nextCursor: null, hasMore: false, mode: ctx.mode, emptyReason: 'no_items', rankingVersion: 'mix_v1' }
      }

      const articleIds = ranked.map((r) => r.articleId)
      const [socialMap, enriched] = await Promise.all([
        loadSocialState(ctx.userId, articleIds),
        enrichPublisherSlugs(ranked),
      ])
      const items = enriched.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))

      const last = ranked[ranked.length - 1]
      const nextCursor = encodeFeedCursor({
        publishedAt: last.publishedAt.toISOString(),
        id: last.articleId,
      })

      return {
        items,
        nextCursor,
        hasMore: ranked.length >= limit,
        mode: ctx.mode,
        rankingVersion: 'mix_v1',
      }
    } catch (err) {
      await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
        {
          eventType: 'feed_error',
          feedType: ctx.mode,
          metadata: { message: err instanceof Error ? err.message : 'unknown' },
        },
      ])
      throw err
    }
  }
}

export const feedService = new FeedService()
