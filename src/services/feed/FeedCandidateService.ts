import 'server-only'

import { and, desc, eq, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { newsClusters, newsSources } from '@/db/schema/crawler'
import { publisherSources, publishers } from '@/db/schema/publishers'
import { userPublisherFollows } from '@/db/schema/socialGraph'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { FeedCandidateRow, FeedCandidateSource, FeedCursorPayload, FeedMode } from '@/types/smartFeed'
import { dayKey, decodeFeedCursor, deterministicScore } from './feedUtils'

const DEFAULT_POOL_SIZE = 150

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

function publishedStatusWhere() {
  return and(
    or(
      eq(news.status, 'published'),
      sql`lower(${news.status}::text) in ('published', 'active')`
    ),
    isNotNull(news.publishedAt),
    lte(news.publishedAt, sql`NOW()`)
  )
}

export type BaseQueryOpts = {
  limit: number
  cursor: FeedCursorPayload | null
  excludeArticleIds?: Set<string>
  excludeClusterIds?: Set<string>
  citySlug?: string | null
  districtSlug?: string | null
  region?: string | null
  userId?: string | null
  category?: string | null
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
  const seenArticles = new Set<string>()
  const seenClusters = new Set<string>()
  const out: FeedCandidateRow[] = []

  for (const row of rows) {
    if (!row.articleId) continue
    if (seenArticles.has(row.articleId)) continue
    seenArticles.add(row.articleId)

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
      publisherName: row.publisherName || 'Kaynak',
      publisherLogoUrl: row.publisherLogoUrl,
      publisherVerified: Boolean(row.publisherVerified),
      headline: row.headline,
      summary: row.summary,
      category: row.category,
      image: row.image,
      video: row.video,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      breaking: Boolean(row.breaking),
      materialUpdate: row.materialUpdate === 1,
      clusterSourceCount: Math.max(1, row.clusterSourceCount || 1),
      clusterImportance: row.clusterImportance ?? 0,
      sourceQualityTier: row.sourceQualityTier,
      sourceHealthScore: row.sourceHealthScore ?? 50,
      citySlug: row.citySlug,
      districtSlug: row.districtSlug,
      likesCount: row.likesCount ?? 0,
      commentsCount: row.commentsCount ?? 0,
      savesCount: row.savesCount ?? 0,
      sharesCount: row.sharesCount ?? 0,
      viewsCount: row.viewsCount ?? 0,
      slug: row.slug || row.articleId,
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
    publisherId: sql<string | null>`coalesce(${publishers.id}, ${publisherSources.publisherId}, ${newsSources.id}, ${news.authorId})`,
    publisherSlug: sql<string | null>`coalesce(${publishers.slug}, ${newsSources.id}, ${news.source})`,
    publisherName: sql<string | null>`coalesce(${publishers.displayName}, ${newsSources.name}, ${news.authorDisplayName}, ${news.source}, 'Kaynak')`,
    publisherLogoUrl: publishers.logoUrl,
    publisherVerified: sql<boolean>`coalesce(${publishers.verificationStatus} = 'VERIFIED' OR ${newsSources.qualityTier} = 'TIER_A' OR ${news.isFeatured}, false)`,
    headline: news.title,
    summary: news.summary,
    category: news.categoryId,
    image: sql<string | null>`coalesce(${news.coverImageUrl}, ${news.thumbnailUrl}, ${newsClusters.primaryImageUrl})`,
    video: news.videoUrl,
    publishedAt: news.publishedAt,
    updatedAt: news.updatedAt,
    breaking: sql<boolean>`coalesce(${news.isBreaking}, false) OR coalesce(${news.editorType} = 'breaking', false)`,
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

/** Parse various timestamp formats into a clean Date */
function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === 'function') return maybe.toDate()
  }
  return null
}

export class FeedCandidateService {
  /** Fetch recent published articles from Firestore fallback if needed */
  private async fetchFirestoreFallback(
    source: FeedCandidateSource,
    opts: BaseQueryOpts
  ): Promise<FeedCandidateRow[]> {
    try {
      const db = getAdminFirestore()
      let q = db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(Math.min(opts.limit * 2, 100))

      const snap = await q.get()
      const now = Date.now()
      const rows: FeedCandidateRow[] = []

      for (const doc of snap.docs) {
        const data = doc.data()
        const pubDate = parseDate(data.publishedAt) || parseDate(data.createdAt)
        if (!pubDate || pubDate.getTime() > now) continue
        if (opts.excludeArticleIds?.has(doc.id)) continue
        if (opts.category && data.categoryId !== opts.category && data.category !== opts.category) continue

        rows.push({
          articleId: doc.id,
          clusterId: data.clusterId || null,
          publisherId: data.sourceId || data.authorId || null,
          publisherSlug: data.sourceSlug || data.source || null,
          publisherName: data.sourceLabel || data.source || data.authorDisplayName || 'Kaynak',
          publisherLogoUrl: data.sourceLogoUrl || null,
          publisherVerified: Boolean(data.publisherVerified || data.verified),
          headline: data.title || '',
          summary: data.summary || data.spot || null,
          category: data.categoryId || data.category || 'gundem',
          image: data.coverImageUrl || data.thumbnail || data.imageUrl || null,
          video: data.videoUrl || null,
          publishedAt: pubDate,
          updatedAt: parseDate(data.updatedAt) || pubDate,
          breaking: Boolean(data.isBreaking || data.breaking),
          materialUpdate: Boolean(data.materialUpdate),
          clusterSourceCount: Number(data.clusterSourceCount || 1),
          clusterImportance: Number(data.clusterImportance || (data.isBreaking ? 80 : 50)),
          sourceQualityTier: data.sourceQualityTier || 'STANDARD',
          sourceHealthScore: Number(data.sourceHealthScore || 75),
          citySlug: data.citySlug || null,
          districtSlug: data.districtSlug || null,
          likesCount: Number(data.likesCount || 0),
          commentsCount: Number(data.commentsCount || data.commentCount || 0),
          savesCount: Number(data.savesCount || 0),
          sharesCount: Number(data.sharesCount || 0),
          viewsCount: Number(data.viewsCount || 0),
          slug: data.slug || doc.id,
          source,
          sortScore: pubDate.getTime(),
        })
      }

      return rows.slice(0, opts.limit)
    } catch (err) {
      console.warn('[feed] firestore fallback candidate fetch failed:', err)
      return []
    }
  }

  /**
   * Primary entry point: Get all active, published canonical news articles
   * without category exclusions (`status in ('published', 'active')`, `published_at <= NOW()`).
   */
  async getRecentPublishedArticles(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    return this.fetchRecent(opts)
  }

  async fetchRecent(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('RECENT', opts)
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select(baseSelect())
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(news.publishedAt), desc(news.id))
        .limit(poolLimit)

      const mapped = mapRows(rows, 'RECENT', opts.excludeArticleIds, opts.excludeClusterIds)
      if (mapped.length === 0 && (!opts.excludeArticleIds || opts.excludeArticleIds.size === 0)) {
        const fallback = await this.fetchFirestoreFallback('RECENT', opts)
        if (fallback.length > 0) return fallback
      }
      return mapped.slice(0, opts.limit)
    } catch {
      return this.fetchFirestoreFallback('RECENT', opts)
    }
  }

  async fetchBreaking(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('BREAKING', opts)
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        or(eq(news.isBreaking, true), eq(news.editorType, 'breaking')),
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select(baseSelect())
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(news.publishedAt), desc(news.id))
        .limit(poolLimit)

      return mapRows(rows, 'BREAKING', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
    } catch {
      return this.fetchFirestoreFallback('BREAKING', opts)
    }
  }

  async fetchPopular(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('POPULAR', opts)
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select({
          ...baseSelect(),
          sortScore: sql<number>`(${news.likesCount} * 3 + ${news.commentsCount} * 2 + ${news.viewsCount})::float`,
        })
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(
          desc(sql`(${news.likesCount} * 3 + ${news.commentsCount} * 2 + ${news.viewsCount})`),
          desc(news.publishedAt)
        )
        .limit(poolLimit)

      return mapRows(rows, 'POPULAR', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
    } catch {
      return this.fetchFirestoreFallback('POPULAR', opts)
    }
  }

  async fetchLocal(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    if (!opts.citySlug && !opts.districtSlug && !opts.region) return []
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) return []

    try {
      const db = requireDb()
      const geo = opts.districtSlug
        ? eq(news.districtSlug, opts.districtSlug)
        : opts.citySlug
          ? eq(news.citySlug, opts.citySlug)
          : eq(newsClusters.region, opts.region!)

      const where = and(
        publishedStatusWhere(),
        geo,
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select(baseSelect())
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(news.publishedAt), desc(news.id))
        .limit(poolLimit)

      return mapRows(rows, 'LOCAL', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
    } catch {
      return []
    }
  }

  async fetchFollowing(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    if (!opts.userId || !hasDatabaseUrl()) return []
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)

    try {
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

      const where = and(
        publishedStatusWhere(),
        or(
          inArray(publishers.id, publisherIds),
          inArray(news.authorId, publisherIds),
          sourceIds.length ? inArray(newsClusters.primarySourceId, sourceIds) : sql`false`
        ),
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select(baseSelect())
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(news.publishedAt), desc(news.id))
        .limit(poolLimit)

      return mapRows(rows, 'FOLLOWING', opts.excludeArticleIds, opts.excludeClusterIds).slice(0, opts.limit)
    } catch {
      return []
    }
  }

  async fetchByIds(articleIds: string[]): Promise<FeedCandidateRow[]> {
    if (!articleIds.length) return []
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('RECENT', { limit: articleIds.length, cursor: null })
    }

    try {
      const db = requireDb()
      const rows = await db
        .select(baseSelect())
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(and(publishedStatusWhere(), inArray(news.id, articleIds)))

      return mapRows(rows, 'RECENT')
    } catch {
      return []
    }
  }

  async fetchDiscovery(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('DISCOVERY', opts)
    }

    try {
      const db = requireDb()
      const dk = dayKey()
      const where = and(
        publishedStatusWhere(),
        opts.category ? eq(news.categoryId, opts.category) : undefined,
        cursorWhere(opts.cursor)
      )
      const rows = await db
        .select({
          ...baseSelect(),
          sortScore: sql<number>`abs(hashtext(${news.id} || ${dk}))::float`,
        })
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(sql`abs(hashtext(${news.id} || ${dk}))`), desc(news.publishedAt))
        .limit(poolLimit)

      const mapped = mapRows(rows, 'DISCOVERY', opts.excludeArticleIds, opts.excludeClusterIds)
      return mapped
        .map((r) => ({ ...r, sortScore: deterministicScore(r.articleId, dk) * 1_000_000_000 }))
        .slice(0, opts.limit)
    } catch {
      return this.fetchFirestoreFallback('DISCOVERY', opts)
    }
  }

  /**
   * Helper to retrieve candidates for cold start across diverse categories.
   */
  async getColdStartCandidates(opts: BaseQueryOpts): Promise<Record<string, FeedCandidateRow[]>> {
    const [breaking, recent, popular, discovery] = await Promise.all([
      this.fetchBreaking(opts),
      this.fetchRecent(opts),
      this.fetchPopular(opts),
      this.fetchDiscovery(opts),
    ])
    return { BREAKING: breaking, RECENT: recent, POPULAR: popular, DISCOVERY: discovery }
  }

  /**
   * Helper to retrieve all personalized candidate pools.
   */
  async getPersonalizedCandidates(opts: BaseQueryOpts): Promise<Record<string, FeedCandidateRow[]>> {
    const [breaking, recent, popular, local, discovery, following] = await Promise.all([
      this.fetchBreaking(opts),
      this.fetchRecent(opts),
      this.fetchPopular(opts),
      this.fetchLocal(opts),
      this.fetchDiscovery(opts),
      opts.userId ? this.fetchFollowing(opts) : Promise.resolve([]),
    ])
    return {
      BREAKING: breaking,
      RECENT: recent,
      POPULAR: popular,
      LOCAL: local,
      DISCOVERY: discovery,
      FOLLOWING: following,
    }
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
