import 'server-only'

import { and, desc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { newsClusters, newsSources, rawArticles } from '@/db/schema/crawler'
import { publisherSources, publishers } from '@/db/schema/publishers'
import { userPublisherFollows } from '@/db/schema/socialGraph'
import type { FeedCandidateRow, FeedCandidateSource, FeedCursorPayload, FeedMode } from '@/types/smartFeed'
import { compareFeedRows, dayKey, decodeFeedCursor, deterministicScore } from './feedUtils'

const CANDIDATE_POOL = 80

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

function cursorWhere(cursor: FeedCursorPayload | null) {
  if (!cursor) return undefined
  const ts = new Date(cursor.publishedAt)
  return or(
    lt(news.publishedAt, ts),
    and(eq(news.publishedAt, ts), lt(news.id, cursor.id))
  )
}

type BaseQueryOpts = {
  limit: number
  cursor: FeedCursorPayload | null
  excludeArticleIds?: Set<string>
  excludeClusterIds?: Set<string>
  citySlug?: string | null
  districtSlug?: string | null
  region?: string | null
  userId?: string | null
}

function mapRows(
  rows: Array<{
    articleId: string
    clusterId: string | null
    publisherId: string | null
    publisherSlug: string | null
    publisherName: string | null
    publisherLogoUrl: string | null
    publisherVerified?: boolean
    headline: string
    summary: string | null
    category: string | null
    image: string | null
    video: string | null
    publishedAt: Date | null
    updatedAt: Date
    breaking: boolean
    materialUpdate: number | null
    clusterSourceCount: number
    clusterImportance: number
    sourceQualityTier: string | null
    sourceHealthScore: number
    citySlug: string | null
    districtSlug: string | null
    likesCount: number
    commentsCount: number
    savesCount: number
    sharesCount: number
    viewsCount: number
    slug: string
    sortScore?: number
  }>,
  source: FeedCandidateSource,
  excludeArticleIds?: Set<string>,
  excludeClusterIds?: Set<string>
): FeedCandidateRow[] {
  const seenClusters = new Set<string>()
  const out: FeedCandidateRow[] = []

  for (const row of rows) {
    if (excludeArticleIds?.has(row.articleId)) continue
    if (row.clusterId) {
      if (excludeClusterIds?.has(row.clusterId)) continue
      if (seenClusters.has(row.clusterId)) continue
      seenClusters.add(row.clusterId)
    }
    if (!row.publishedAt) continue

    out.push({
      articleId: row.articleId,
      clusterId: row.clusterId,
      publisherId: row.publisherId,
      publisherSlug: row.publisherSlug,
      publisherName: row.publisherName,
      publisherLogoUrl: row.publisherLogoUrl,
      publisherVerified: row.publisherVerified,
      headline: row.headline,
      summary: row.summary,
      category: row.category,
      image: row.image,
      video: row.video,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      breaking: row.breaking,
      materialUpdate: row.materialUpdate === 1,
      clusterSourceCount: Math.max(1, row.clusterSourceCount),
      clusterImportance: row.clusterImportance ?? 0,
      sourceQualityTier: row.sourceQualityTier,
      sourceHealthScore: row.sourceHealthScore ?? 50,
      citySlug: row.citySlug,
      districtSlug: row.districtSlug,
      likesCount: row.likesCount,
      commentsCount: row.commentsCount,
      savesCount: row.savesCount,
      sharesCount: row.sharesCount,
      viewsCount: row.viewsCount ?? 0,
      slug: row.slug,
      source,
      sortScore: row.sortScore ?? row.publishedAt.getTime(),
    })
  }
  return out
}

function baseSelect() {
  return {
    articleId: news.id,
    clusterId: newsClusters.id,
    publisherId: publishers.id,
    publisherSlug: publishers.slug,
    publisherName: publishers.displayName,
    publisherLogoUrl: publishers.logoUrl,
    publisherVerified: sql<boolean>`${publishers.verificationStatus} = 'VERIFIED'`,
    headline: news.title,
    summary: news.summary,
    category: news.categoryId,
    image: sql<string | null>`coalesce(${news.coverImageUrl}, ${news.thumbnailUrl}, ${newsClusters.primaryImageUrl})`,
    video: news.videoUrl,
    publishedAt: news.publishedAt,
    updatedAt: news.updatedAt,
    breaking: news.isBreaking,
    materialUpdate: newsClusters.hasMaterialUpdate,
    clusterSourceCount: sql<number>`coalesce(${newsClusters.uniqueSourceCount}, ${newsClusters.sourceCount}, 1)`,
    clusterImportance: sql<number>`coalesce(${newsClusters.importanceScore}, 0)`,
    sourceQualityTier: newsSources.qualityTier,
    sourceHealthScore: sql<number>`coalesce(${newsSources.healthScore}, 50)`,
    citySlug: news.citySlug,
    districtSlug: news.districtSlug,
    likesCount: news.likesCount,
    commentsCount: news.commentsCount,
    savesCount: news.savesCount,
    sharesCount: news.sharesCount,
    viewsCount: news.viewsCount,
    slug: news.slug,
  }
}

export class FeedCandidateService {
  async fetchRecent(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const db = requireDb()
    const where = and(
      eq(news.status, 'published'),
      isNotNull(news.publishedAt),
      cursorWhere(opts.cursor)
    )
    const rows = await db
      .select(baseSelect())
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(desc(news.publishedAt), desc(news.id))
      .limit(CANDIDATE_POOL)

    return mapRows(rows, 'RECENT', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
  }

  async fetchBreaking(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const db = requireDb()
    const where = and(
      eq(news.status, 'published'),
      isNotNull(news.publishedAt),
      or(eq(news.isBreaking, true), eq(news.editorType, 'breaking')),
      cursorWhere(opts.cursor)
    )
    const rows = await db
      .select(baseSelect())
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(desc(news.publishedAt), desc(news.id))
      .limit(CANDIDATE_POOL)

    return mapRows(rows, 'BREAKING', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
  }

  async fetchPopular(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const db = requireDb()
    const where = and(
      eq(news.status, 'published'),
      isNotNull(news.publishedAt),
      cursorWhere(opts.cursor)
    )
    const rows = await db
      .select({
        ...baseSelect(),
        sortScore: sql<number>`(${news.likesCount} * 3 + ${news.commentsCount} * 2 + ${news.viewsCount})::float`,
      })
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(
        desc(sql`(${news.likesCount} * 3 + ${news.commentsCount} * 2 + ${news.viewsCount})`),
        desc(news.publishedAt)
      )
      .limit(CANDIDATE_POOL)

    return mapRows(rows, 'POPULAR', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
  }

  async fetchLocal(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    if (!opts.citySlug && !opts.districtSlug && !opts.region) return []

    const db = requireDb()
    const geo = opts.districtSlug
      ? eq(news.districtSlug, opts.districtSlug)
      : opts.citySlug
        ? eq(news.citySlug, opts.citySlug)
        : eq(newsClusters.region, opts.region!)

    const where = and(eq(news.status, 'published'), isNotNull(news.publishedAt), geo, cursorWhere(opts.cursor))
    const rows = await db
      .select(baseSelect())
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(desc(news.publishedAt), desc(news.id))
      .limit(CANDIDATE_POOL)

    return mapRows(rows, 'LOCAL', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
  }

  async fetchFollowing(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    if (!opts.userId) return []
    const db = requireDb()

    const follows = await db
      .select({ publisherId: userPublisherFollows.publisherId })
      .from(userPublisherFollows)
      .where(eq(userPublisherFollows.userId, opts.userId))
    const publisherIds = follows.map((f) => f.publisherId)
    if (!publisherIds.length) return []

    const sourceLinks = await db
      .select({ sourceId: publisherSources.sourceId })
      .from(publisherSources)
      .where(inArray(publisherSources.publisherId, publisherIds))
    const sourceIds = sourceLinks.map((s) => s.sourceId)
    if (!sourceIds.length) return []

    const where = and(
      eq(news.status, 'published'),
      isNotNull(news.publishedAt),
      inArray(rawArticles.sourceId, sourceIds),
      cursorWhere(opts.cursor)
    )
    const rows = await db
      .select(baseSelect())
      .from(news)
      .innerJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .innerJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .innerJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(desc(news.publishedAt), desc(news.id))
      .limit(CANDIDATE_POOL)

    return mapRows(rows, 'FOLLOWING', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
  }

  async fetchByIds(articleIds: string[]): Promise<FeedCandidateRow[]> {
    if (!articleIds.length) return []
    const db = requireDb()
    const rows = await db
      .select(baseSelect())
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(and(eq(news.status, 'published'), inArray(news.id, articleIds)))

    return mapRows(rows, 'RECENT')
  }

  async fetchDiscovery(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const db = requireDb()
    const dk = dayKey()
    const where = and(eq(news.status, 'published'), isNotNull(news.publishedAt), cursorWhere(opts.cursor))
    const rows = await db
      .select({
        ...baseSelect(),
        sortScore: sql<number>`abs(hashtext(${news.id} || ${dk}))::float`,
      })
      .from(news)
      .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .leftJoin(rawArticles, eq(rawArticles.editorialNewsId, news.id))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .leftJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(where)
      .orderBy(desc(sql`abs(hashtext(${news.id} || ${dk}))`), desc(news.publishedAt))
      .limit(CANDIDATE_POOL)

    const mapped = await mapRows(rows, 'DISCOVERY', opts.excludeArticleIds, opts.excludeClusterIds)
    return mapped
      .map((r) => ({ ...r, sortScore: deterministicScore(r.articleId, dk) * 1_000_000_000 }))
      .slice(0, opts.limit)
  }

  async fetchForMode(
    mode: FeedMode,
    opts: BaseQueryOpts & { cursorRaw?: string | null }
  ): Promise<FeedCandidateRow[]> {
    const cursor = decodeFeedCursor(opts.cursorRaw) ?? opts.cursor
    const base = { ...opts, cursor }

    switch (mode) {
      case 'breaking':
        return this.fetchBreaking(base)
      case 'local':
        return this.fetchLocal(base)
      case 'following':
        return this.fetchFollowing(base)
      case 'personal':
      default:
        return this.fetchRecent(base)
    }
  }
}

export const feedCandidateService = new FeedCandidateService()
