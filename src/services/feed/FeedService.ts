import 'server-only'

import { and, desc, eq, gte, inArray, or } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { articleLikes, savedArticles, socialEvents } from '@/db/schema/socialGraph'
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
import { feedSessionService } from './FeedSessionService'
import { feedTelemetryService } from './FeedTelemetryService'
import { buildSessionIntentFromEvents, emptySessionIntent } from './nfRank/NFRankEngine'

async function loadSessionIntent(userId: string | null) {
  if (!userId || !hasDatabaseUrl()) return emptySessionIntent()
  try {
    const db = getDb()
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const rows = await db
      .select({
        eventType: socialEvents.eventType,
        targetId: socialEvents.targetId,
        metadata: socialEvents.metadata,
        createdAt: socialEvents.createdAt,
      })
      .from(socialEvents)
      .where(and(eq(socialEvents.userId, userId), gte(socialEvents.createdAt, since)))
      .orderBy(desc(socialEvents.createdAt))
      .limit(80)
    const now = Date.now()
    return buildSessionIntentFromEvents(
      rows.map((r) => {
        const meta = (r.metadata || {}) as {
          category?: string
          publisherId?: string
          tags?: string[]
          dwellMs?: number
        }
        return {
          eventType: r.eventType,
          category: meta.category ?? null,
          publisherId: meta.publisherId ?? null,
          articleId: r.targetId,
          tags: meta.tags ?? null,
          dwellMs: meta.dwellMs,
          ageMinutes: Math.max(0, (now - r.createdAt.getTime()) / 60_000),
        }
      })
    )
  } catch {
    return emptySessionIntent()
  }
}

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
    tags: row.tags?.length ? row.tags.slice(0, 8) : undefined,
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

      // Category tab: category-native archive walk with session-wide exclusion (no soft-refill replay).
      if (ctx.category) {
        const categoryKey = ctx.category.trim().toLowerCase()
        const existingSession =
          sessionToken && !ctx.refresh
            ? feedSessionService.decode(sessionToken)
            : null
        const sessionOk =
          existingSession &&
          existingSession.mode === 'personal' &&
          (existingSession.category ?? null) === categoryKey

        let session = sessionOk
          ? existingSession!
          : feedSessionService.create('personal', [], undefined, {
              category: categoryKey,
              olderThan: null,
              corpusExhausted: false,
            })

        // Bootstrap / refill until we have a page of unread IDs or true exhaustion.
        let refillPasses = 0
        while (
          session.rankedIds.length - (session.offset ?? 0) < limit &&
          !session.corpusExhausted &&
          refillPasses < 6
        ) {
          refillPasses += 1
          const seed = new Set<string>([...session.rankedIds])
          // Durable seen + session-returned IDs — never drop seen to fake infinity.
          const { seenArticles, seenClusters } = await feedSeenService.filterSuppressible(
            ctx.userId,
            ctx.sessionId,
            `category:${categoryKey}`,
            []
          )
          for (const id of seenArticles) seed.add(id)
          const exclude = await feedSeenService.expandArticleIdentities(seed)

          const walkCursor =
            session.olderThan && session.rankedIds.length > 0
              ? {
                  publishedAt: session.olderThan,
                  id: session.rankedIds[session.rankedIds.length - 1] ?? '0',
                }
              : timeCursor

          const fetchOpts = {
            ...candidateOpts,
            cursor: walkCursor,
            excludeArticleIds: exclude,
            excludeClusterIds: seenClusters,
            // Deepen pool for category archive pages (still bounded).
            limit: Math.max(limit * 4, 40),
          }

          const recent = await feedCandidateService.fetchRecent(fetchOpts)
          let batch = feedRankingV1.rankMode('personal', recent, Math.max(limit * 2, 20))

          // Progressive archive: if thin, walk older with publishedBefore while keeping exclusions.
          if (batch.length < limit) {
            const have = new Set(batch.map((r) => r.articleId))
            let olderBound =
              session.olderThan ??
              (batch.length
                ? batch[batch.length - 1]!.publishedAt.toISOString()
                : walkCursor?.publishedAt ?? null)
            for (let walk = 0; walk < 6 && batch.length < limit * 2; walk++) {
              if (!olderBound) break
              const older = await feedCandidateService.fetchRecent({
                ...candidateOpts,
                cursor: null,
                publishedBefore: olderBound,
                excludeArticleIds: new Set([...exclude, ...have]),
                excludeClusterIds: seenClusters,
                limit: Math.max(limit * 4, 40),
              })
              if (!older.length) break
              for (const row of older) {
                if (have.has(row.articleId)) continue
                have.add(row.articleId)
                batch.push(row)
              }
              const last = older[older.length - 1]!
              olderBound = last.publishedAt.toISOString()
              if (older.length < Math.max(3, Math.floor(limit / 2))) break
            }
            batch = feedRankingV1.rankMode('personal', batch, Math.max(limit * 2, 20))
          }

          const newIds = batch.map((r) => r.articleId)
          const olderThan =
            batch.length > 0
              ? batch.reduce(
                  (min, r) =>
                    r.publishedAt.getTime() < min ? r.publishedAt.getTime() : min,
                  batch[0]!.publishedAt.getTime()
                )
              : null
          const olderThanIso = olderThan != null ? new Date(olderThan).toISOString() : session.olderThan
          const beforeLen = session.rankedIds.length - (session.offset ?? 0)
          session = {
            ...feedSessionService.appendWindow(session, newIds, olderThanIso),
            category: categoryKey,
          }
          const afterLen = session.rankedIds.length - (session.offset ?? 0)
          if (newIds.length === 0 || afterLen <= beforeLen) {
            session = { ...session, corpusExhausted: true }
            break
          }
        }

        const { ids, nextPayload, hasMoreInSnapshot } = feedSessionService.slicePage(session, limit)
        if (!ids.length) {
          return {
            items: [],
            nextCursor: null,
            hasMore: false,
            mode: ctx.mode,
            emptyReason: 'no_items',
            rankingVersion: 'category_mix_v1',
            feedSessionId: session.sessionId,
          }
        }

        const rows = await feedCandidateService.fetchByIds(ids)
        const ordered = feedSessionService.reorderBySession(rows, nextPayload)
        const articleIds = ordered.map((r) => r.articleId)
        const [socialMap, enriched] = await Promise.all([
          loadSocialState(ctx.userId, articleIds),
          enrichPublisherSlugs(ordered),
        ])
        const items = enriched.map((r) => toDto(r, socialMap.get(r.articleId), opts?.debug))

        const last = ordered[ordered.length - 1]!
        const mayHaveMore = hasMoreInSnapshot || !nextPayload.corpusExhausted
        const sessionTokenOut = feedSessionService.encode({
          ...nextPayload,
          category: categoryKey,
        })
        const nextCursor = mayHaveMore
          ? encodeFeedCursor({
              publishedAt: last.publishedAt.toISOString(),
              id: last.articleId,
              session: sessionTokenOut,
              offset: nextPayload.offset,
            })
          : null

        return {
          items,
          nextCursor,
          hasMore: mayHaveMore,
          mode: ctx.mode,
          rankingVersion: 'category_mix_v1',
          feedSessionId: nextPayload.sessionId,
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
        const sessionIntent = await loadSessionIntent(ctx.userId)
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
          sessionIntent,
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
