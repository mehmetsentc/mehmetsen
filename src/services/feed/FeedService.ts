import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { articleLikes, savedArticles } from '@/db/schema/socialGraph'
import { FEED_PAGINATION } from '@/lib/feed/config'
import type {
  FeedCandidateRow,
  FeedItemDto,
  FeedMode,
  FeedPageDto,
  FeedSocialState,
} from '@/types/smartFeed'
import { encodeFeedCursor } from './feedUtils'
import { feedCandidateService } from './FeedCandidateService'
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
}

function clampLimit(limit?: number): number {
  const n = limit ?? FEED_PAGINATION.defaultLimit
  return Math.min(Math.max(n, FEED_PAGINATION.minLimit), FEED_PAGINATION.maxLimit)
}

function toDto(row: FeedCandidateRow, social?: FeedSocialState | null): FeedItemDto {
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
    reason: row.source,
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
  async getFeed(ctx: FeedRequestContext): Promise<FeedPageDto> {
    const limit = clampLimit(ctx.limit)
    const feedType = ctx.mode

    if (ctx.mode === 'following' && !ctx.userId) {
      return { items: [], nextCursor: null, hasMore: false, mode: ctx.mode, emptyReason: 'auth_required' }
    }

    await feedTelemetryService.recordBatch(ctx.userId, ctx.sessionId, [
      { eventType: 'feed_request', feedType: ctx.mode },
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

      // Prefetch seen sets for suppression
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
        return { items: [], nextCursor: null, hasMore: false, mode: ctx.mode, emptyReason: 'no_items' }
      }

      const articleIds = ranked.map((r) => r.articleId)
      const socialMap = await loadSocialState(ctx.userId, articleIds)
      const items = ranked.map((r) => toDto(r, socialMap.get(r.articleId)))

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
