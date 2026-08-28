import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { articleLikes, savedArticles } from '@/db/schema/socialGraph'
import { FEED_PAGINATION } from '@/lib/feed/config'
import { isSmartFeedRankingEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { FEED_RANKING_VERSION } from '@/lib/feed/rankingConfig'
import type {
  FeedCandidateRow,
  FeedItemDto,
  FeedMode,
  FeedPageDto,
  FeedSocialState,
  ScoredFeedCandidate,
} from '@/types/smartFeed'
import { decodeFeedCursor, encodeFeedCursor } from './feedUtils'
import { feedCandidateService } from './FeedCandidateService'
import { feedRankingPipeline } from './FeedRankingPipeline'
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
}

function clampLimit(limit?: number): number {
  const n = limit ?? FEED_PAGINATION.defaultLimit
  return Math.min(Math.max(n, FEED_PAGINATION.minLimit), FEED_PAGINATION.maxLimit)
}

function toDto(row: FeedCandidateRow | ScoredFeedCandidate, social?: FeedSocialState | null, debug?: boolean): FeedItemDto {
  const scored = 'score' in row ? row : null
  return {
    id: row.articleId,
    type: 'article',
    articleId: row.articleId,
    clusterId: row.clusterId,
    publisher: row.publisherId
      ? {
          id: row.publisherId,
          slug: row.publisherSlug ?? row.publisherId,
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
  return map
}

export class FeedService {
  async getFeed(ctx: FeedRequestContext, opts?: { debug?: boolean }): Promise<FeedPageDto> {
    const limit = clampLimit(ctx.limit)
    const feedType = ctx.mode
    const rankingEnabled = await isSmartFeedRankingEffectiveForUser(ctx.userId)
    const cursorPayload = decodeFeedCursor(ctx.cursor)
    const sessionToken = cursorPayload?.session ?? null

    if (ctx.mode === 'following' && !ctx.userId) {
      return { items: [], nextCursor: null, hasMore: false, mode: ctx.mode, emptyReason: 'auth_required' }
    }

    await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
      {
        eventType: 'feed_request',
        feedType: ctx.mode,
        metadata: {
          ranking_version: rankingEnabled ? FEED_RANKING_VERSION : 'mix_v1',
          feedSessionId: sessionToken ? 'present' : 'new',
        },
      },
    ])

    try {
      const candidateOpts = {
        limit: limit * 3,
        cursor: null,
        cursorRaw: ctx.cursor,
        citySlug: ctx.citySlug,
        districtSlug: ctx.districtSlug,
        region: ctx.region,
        userId: ctx.userId,
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
        })

        const ranked = pipelineResult.ranked
        if (!ranked.length) {
          await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
            { eventType: 'feed_empty', feedType: ctx.mode, metadata: { ranking_version: pipelineResult.rankingVersion } },
          ])
          return {
            items: [],
            nextCursor: null,
            hasMore: false,
            mode: ctx.mode,
            emptyReason: 'no_items',
            rankingVersion: pipelineResult.rankingVersion,
            feedSessionId: pipelineResult.session.sessionId,
          }
        }

        const articleIds = ranked.map((r) => r.articleId)
        const socialMap = await loadSocialState(ctx.userId, articleIds)
        const items = ranked.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))

        const last = ranked[ranked.length - 1]
        const nextCursor = pipelineResult.sessionToken
          ? encodeFeedCursor({
              publishedAt: last.publishedAt.toISOString(),
              id: last.articleId,
              session: pipelineResult.sessionToken,
              offset: pipelineResult.session.offset,
            })
          : encodeFeedCursor({ publishedAt: last.publishedAt.toISOString(), id: last.articleId })

        return {
          items,
          nextCursor,
          hasMore: pipelineResult.session.offset < pipelineResult.session.rankedIds.length,
          mode: ctx.mode,
          rankingVersion: pipelineResult.rankingVersion,
          feedSessionId: pipelineResult.session.sessionId,
        }
      }

      let ranked: FeedCandidateRow[] = []

      if (ctx.mode === 'personal') {
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
      const socialMap = await loadSocialState(ctx.userId, articleIds)
      const items = ranked.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))

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
