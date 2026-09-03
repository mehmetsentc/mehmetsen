import 'server-only'

import { and, desc, eq, inArray, isNotNull, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { newsClusters, newsSources } from '@/db/schema/crawler'
import { publisherSources, publishers } from '@/db/schema/publishers'
import { userPublisherFollows } from '@/db/schema/socialGraph'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { FeedCandidateRow, FeedCandidateSource, FeedCursorPayload, FeedMode } from '@/types/smartFeed'
import { dayKey, decodeFeedCursor, deterministicScore } from './feedUtils'
import {
  canAppearInSmartFeed,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'
import { selectSmartFeedSummary } from '@/lib/feed/smartFeedSummary'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'
import { feedSeenService } from '@/services/feed/FeedSeenService'

const DEFAULT_POOL_SIZE = 150
/** Bounded FS supplement batches — avoid scanning the full legacy corpus. */
const FS_SUPPLEMENT_BATCH = 50
const FS_SUPPLEMENT_MAX_ATTEMPTS = 3
/** Extra attempts when walking older LEGACY_ALLOWED windows. */
const FS_OLDER_MAX_ATTEMPTS = 5
const FS_SUPPLEMENT_HARD_CAP = 100

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

function cursorWhere(cursor: FeedCursorPayload | null, publishedBefore?: Date | string | null) {
  const parts: ReturnType<typeof and>[] = []
  if (cursor) {
    const ts = new Date(cursor.publishedAt)
    parts.push(
      or(
        lt(news.publishedAt, ts),
        and(eq(news.publishedAt, ts), lt(news.id, cursor.id))
      )!
    )
  }
  if (publishedBefore) {
    const before = publishedBefore instanceof Date ? publishedBefore : new Date(publishedBefore)
    if (!Number.isNaN(before.getTime())) {
      parts.push(lt(news.publishedAt, before))
    }
  }
  if (!parts.length) return undefined
  if (parts.length === 1) return parts[0]
  return and(...parts)
}

function publishedStatusWhere() {
  return and(
    or(
      eq(news.status, 'published'),
      sql`lower(${news.status}::text) in ('published', 'active')`
    ),
    sql`${news.status} NOT IN ('archived', 'draft', 'pending', 'banned')`,
    isNotNull(news.publishedAt),
    lte(news.publishedAt, sql`NOW()`),
    sql`${news.id} NOT LIKE 'test_%'`,
    sql`coalesce(${news.title}, '') NOT LIKE '[%TEST%]'`
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
  /** Expanded category ids (parent + children). Prefer over `category`. */
  categoryIds?: string[] | null
  /** Exclusive upper bound for older corpus windows (ISO or Date). */
  publishedBefore?: Date | string | null
}

function categoryFilterWhere(opts: BaseQueryOpts) {
  const ids =
    opts.categoryIds && opts.categoryIds.length > 0
      ? opts.categoryIds
      : opts.category
        ? [opts.category]
        : null
  if (!ids?.length) return undefined
  if (ids.length === 1) return eq(news.categoryId, ids[0]!)
  return inArray(news.categoryId, ids)
}

/** Push exclusions into SQL so pagination can walk past a large seen/served set. */
function excludeIdsWhere(opts: BaseQueryOpts) {
  if (!opts.excludeArticleIds?.size) return undefined
  const ids = [...opts.excludeArticleIds].slice(0, 300)
  if (!ids.length) return undefined
  return notInArray(news.id, ids)
}

function poolLimitFor(opts: BaseQueryOpts, floor = DEFAULT_POOL_SIZE) {
  const excluded = opts.excludeArticleIds?.size ?? 0
  return Math.max(opts.limit * 3, floor, Math.min(excluded + opts.limit * 2, 400))
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
    isFeatured?: boolean
    isEditorPick?: boolean
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
      summary: selectSmartFeedSummary({ summary: row.summary }),
      category: row.category,
      image: row.image,
      video: row.video,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      breaking: Boolean(row.breaking),
      materialUpdate: row.materialUpdate === 1,
      isFeatured: Boolean(row.isFeatured),
      isEditorPick: Boolean(row.isEditorPick),
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
    publisherId: sql<string | null>`coalesce(${publishers.id}, ${publisherSources.publisherId}, ${newsSources.id})`,
    // Only real publishers.slug is linkable to /publisher/[slug]. Never fall back to
    // newsSources.id / news.source display labels (those 404 on the profile page).
    // Never coalesce news.authorId — AI editor UIDs are not followable publishers.
    publisherSlug: publishers.slug,
    publisherName: sql<string | null>`coalesce(${publishers.displayName}, ${newsSources.name}, ${news.authorDisplayName}, ${news.source}, 'Kaynak')`,
    publisherLogoUrl: publishers.logoUrl,
    publisherVerified: sql<boolean>`coalesce(${publishers.verificationStatus} = 'VERIFIED', false)`,
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
    isFeatured: news.isFeatured,
    isEditorPick: news.isEditorPick,
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
  private mapFirestoreDocToRow(
    docId: string,
    data: FirebaseFirestore.DocumentData,
    source: FeedCandidateSource
  ): FeedCandidateRow | null {
    const pubDate = parseDate(data.publishedAt) || parseDate(data.createdAt)
    if (!pubDate || pubDate.getTime() > Date.now()) return null

    const readClass = classifyPublicRead(
      publicReadMetaFromFirestoreDoc(docId, data as Record<string, unknown>)
    )
    if (!canAppearInSmartFeed(readClass)) return null

    const rawSlug =
      (typeof data.sourceSlug === 'string' && data.sourceSlug.trim()) ||
      (typeof data.publisherSlug === 'string' && data.publisherSlug.trim()) ||
      ''
    const publisherSlug = isPublisherProfileSlug(rawSlug) ? rawSlug.trim().toLowerCase() : null

    return {
      articleId: docId,
      clusterId: data.clusterId || null,
      // Follow identity: source registry / ingestion id only — never AI authorId.
      publisherId:
        (typeof data.sourceId === 'string' && data.sourceId.trim()) ||
        (typeof data.ingestionSourceId === 'string' && data.ingestionSourceId.trim()) ||
        null,
      publisherSlug,
      publisherName: data.sourceLabel || data.source || data.authorDisplayName || 'Kaynak',
      publisherLogoUrl: data.sourceLogoUrl || null,
      publisherVerified: Boolean(data.publisherVerified || data.verified),
      headline: data.title || '',
      summary: selectSmartFeedSummary({
        smartFeedSummary:
          typeof data.smartFeedSummary === 'string' ? data.smartFeedSummary : null,
        summary: typeof data.summary === 'string' ? data.summary : null,
        spot: typeof data.spot === 'string' ? data.spot : null,
        description: typeof data.description === 'string' ? data.description : null,
        teaser: typeof data.teaser === 'string' ? data.teaser : null,
      }),
      category: data.categoryId || data.category || 'gundem',
      image: data.coverImageUrl || data.thumbnail || data.imageUrl || null,
      video: data.videoUrl || null,
      publishedAt: pubDate,
      updatedAt: parseDate(data.updatedAt) || pubDate,
      breaking: Boolean(data.isBreaking || data.breaking),
      materialUpdate: Boolean(data.materialUpdate),
      isFeatured: Boolean(data.isFeatured || data.featured),
      isEditorPick: Boolean(data.isEditorPick || data.editorPick),
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
      slug: data.slug || docId,
      source,
      sortScore: pubDate.getTime(),
    }
  }

  /**
   * Bounded Firestore candidate fetch with P18.3 policy filter + refill.
   * Does not scan the full 40k corpus — max FS_*_MAX_ATTEMPTS batches per call.
   * publishedBefore walks older LEGACY_ALLOWED windows without replaying recent docs.
   */
  private async fetchFirestoreFallback(
    source: FeedCandidateSource,
    opts: BaseQueryOpts & { needed?: number; olderWindow?: boolean }
  ): Promise<FeedCandidateRow[]> {
    const needed = Math.min(
      Math.max(opts.needed ?? opts.limit, 1),
      FS_SUPPLEMENT_HARD_CAP
    )
    const maxAttempts = opts.olderWindow
      ? FS_OLDER_MAX_ATTEMPTS
      : opts.excludeArticleIds && opts.excludeArticleIds.size > 20
        ? FS_OLDER_MAX_ATTEMPTS
        : FS_SUPPLEMENT_MAX_ATTEMPTS
    const publishedBefore = opts.publishedBefore
      ? opts.publishedBefore instanceof Date
        ? opts.publishedBefore
        : new Date(opts.publishedBefore)
      : null
    const beforeOk = publishedBefore && !Number.isNaN(publishedBefore.getTime())

    try {
      const db = getAdminFirestore()
      const rows: FeedCandidateRow[] = []
      const expandedExclude = await feedSeenService.expandArticleIdentities(
        new Set(opts.excludeArticleIds ? [...opts.excludeArticleIds] : [])
      )
      const seen = new Set<string>(expandedExclude)
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined
      let attempts = 0

      while (rows.length < needed && attempts < maxAttempts) {
        attempts += 1
        const batchSize = Math.min(
          FS_SUPPLEMENT_BATCH,
          Math.max(needed - rows.length, 20) * 2
        )
        let q: FirebaseFirestore.Query = db
          .collection(Collections.NEWS)
          .where('status', '==', 'published')
          .orderBy('publishedAt', 'desc')

        // Older windows: continue past boundary via startAfter on the same orderBy
        // (avoids a second inequality that needs a new composite index).
        if (lastDoc) {
          q = q.startAfter(lastDoc)
        } else if (beforeOk) {
          q = q.startAfter(publishedBefore)
        }

        q = q.limit(batchSize)

        const snap = await q.get()
        if (snap.empty) break
        lastDoc = snap.docs[snap.docs.length - 1]

        for (const doc of snap.docs) {
          if (seen.has(doc.id)) continue
          if (opts.excludeClusterIds?.size) {
            const clusterId = typeof doc.data().clusterId === 'string' ? doc.data().clusterId : null
            if (clusterId && opts.excludeClusterIds.has(clusterId)) continue
          }
          if (
            opts.category &&
            doc.data().categoryId !== opts.category &&
            doc.data().category !== opts.category
          ) {
            continue
          }

          const data = doc.data()
          if (source === 'BREAKING') {
            const isBreaking =
              data.isBreaking === true ||
              data.breaking === true ||
              data.categoryId === 'son-dakika' ||
              data.category === 'son-dakika' ||
              data.editorType === 'breaking'
            if (!isBreaking) continue
          }
          if (source === 'FEATURED') {
            const isFeatured =
              data.isFeatured === true ||
              data.featured === true ||
              data.isEditorPick === true ||
              data.editorPick === true
            if (!isFeatured) continue
          }

          const row = this.mapFirestoreDocToRow(doc.id, data, source)
          if (!row) continue
          if (beforeOk && row.publishedAt.getTime() >= publishedBefore!.getTime()) continue
          if (row.clusterId && opts.excludeClusterIds?.has(row.clusterId)) continue

          seen.add(doc.id)
          rows.push(row)
          if (rows.length >= needed) break
        }

        if (snap.docs.length < batchSize) break
      }

      return this.canonicalizeFirestoreRows(rows.slice(0, needed))
    } catch (err) {
      console.warn('[feed] firestore fallback candidate fetch failed:', err)
      return []
    }
  }

  /**
   * When a Firestore doc has a PG mirror (legacy_firestore_id), emit the PG news.id
   * so rankedIds / impressions / exclusions share one suppression identity.
   */
  private async canonicalizeFirestoreRows(rows: FeedCandidateRow[]): Promise<FeedCandidateRow[]> {
    if (!rows.length || !hasDatabaseUrl()) return rows
    const fsIds = [...new Set(rows.map((r) => r.articleId))].slice(0, 500)
    if (!fsIds.length) return rows
    try {
      const db = requireDb()
      const mirrors = await db
        .select({ id: news.id, legacyFirestoreId: news.legacyFirestoreId, slug: news.slug })
        .from(news)
        .where(or(inArray(news.legacyFirestoreId, fsIds), inArray(news.id, fsIds)))
        .limit(500)
      if (!mirrors.length) return rows
      const fsToPg = new Map<string, { id: string; slug: string | null }>()
      for (const m of mirrors) {
        if (m.legacyFirestoreId) fsToPg.set(m.legacyFirestoreId, { id: m.id, slug: m.slug })
        fsToPg.set(m.id, { id: m.id, slug: m.slug })
      }
      return rows.map((row) => {
        const hit = fsToPg.get(row.articleId)
        if (!hit || hit.id === row.articleId) return row
        return {
          ...row,
          articleId: hit.id,
          slug: hit.slug || row.slug,
        }
      })
    } catch {
      return rows
    }
  }

  /**
   * P18.3C — bounded older LEGACY_ALLOWED window: publishedAt < boundary.
   */
  async fetchOlderLegacyAllowed(opts: BaseQueryOpts & { publishedBefore: Date | string }): Promise<FeedCandidateRow[]> {
    return this.fetchFirestoreFallback('RECENT', {
      ...opts,
      needed: opts.limit,
      olderWindow: true,
      publishedBefore: opts.publishedBefore,
    })
  }

  /**
   * P18.3A — PG primary stays preferred; when PG underfills page/pool capacity,
   * supplement remaining slots from LEGACY_ALLOWED (not quarantined).
   */
  private async mergeWithLegacySupplement(
    source: FeedCandidateSource,
    primary: FeedCandidateRow[],
    opts: BaseQueryOpts
  ): Promise<FeedCandidateRow[]> {
    if (primary.length >= opts.limit) return primary.slice(0, opts.limit)

    const seed = new Set<string>(opts.excludeArticleIds ? [...opts.excludeArticleIds] : [])
    for (const row of primary) seed.add(row.articleId)
    const exclude = await feedSeenService.expandArticleIdentities(seed)

    const remaining = opts.limit - primary.length
    const fallback = await this.fetchFirestoreFallback(source, {
      ...opts,
      excludeArticleIds: exclude,
      needed: remaining,
      limit: remaining,
      olderWindow: Boolean(opts.publishedBefore),
    })

    if (fallback.length === 0) return primary.slice(0, opts.limit)

    console.info('[feed] legacy_allowed_supplement', {
      source,
      pg: primary.length,
      fs: fallback.length,
      target: opts.limit,
    })

    // Collapse PG/FS twins if canonicalize left any exact overlap.
    const seen = new Set(primary.map((r) => r.articleId))
    const merged = [...primary]
    for (const row of fallback) {
      if (seen.has(row.articleId)) continue
      seen.add(row.articleId)
      merged.push(row)
    }
    return merged.slice(0, opts.limit)
  }

  /**
   * Primary entry point: Get all active, published canonical news articles
   * without category exclusions (`status in ('published', 'active')`, `published_at <= NOW()`).
   */
  async getRecentPublishedArticles(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    return this.fetchRecent(opts)
  }

  async fetchRecent(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = poolLimitFor(opts)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('RECENT', { ...opts, needed: opts.limit })
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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
      return this.mergeWithLegacySupplement('RECENT', mapped, opts)
    } catch {
      return this.fetchFirestoreFallback('RECENT', { ...opts, needed: opts.limit })
    }
  }

  async fetchBreaking(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('BREAKING', { ...opts, needed: opts.limit })
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        or(eq(news.isBreaking, true), eq(news.editorType, 'breaking')),
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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

      const mapped = mapRows(rows, 'BREAKING', opts.excludeArticleIds, opts.excludeClusterIds)
      return this.mergeWithLegacySupplement('BREAKING', mapped, opts)
    } catch {
      return this.fetchFirestoreFallback('BREAKING', { ...opts, needed: opts.limit })
    }
  }

  /** Editorial featured / editor-pick pins — real is_featured / is_editor_pick only. */
  async fetchFeatured(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('FEATURED', { ...opts, needed: opts.limit })
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        or(eq(news.isFeatured, true), eq(news.isEditorPick, true)),
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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

      const mapped = mapRows(rows, 'FEATURED', opts.excludeArticleIds, opts.excludeClusterIds)
      return this.mergeWithLegacySupplement('FEATURED', mapped, opts)
    } catch {
      return this.fetchFirestoreFallback('FEATURED', { ...opts, needed: opts.limit })
    }
  }

  async fetchPopular(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('POPULAR', { ...opts, needed: opts.limit })
    }

    try {
      const db = requireDb()
      const where = and(
        publishedStatusWhere(),
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
      )
      // View-heavy popularity sort (still freshness-bounded by published window / scoring decay).
      const popularityExpr = sql`(${news.likesCount} * 3 + ${news.commentsCount} * 2 + ${news.savesCount} * 2 + ${news.viewsCount} * 0.2)`
      const rows = await db
        .select({
          ...baseSelect(),
          sortScore: sql<number>`(${popularityExpr})::float`,
        })
        .from(news)
        .leftJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
        .leftJoin(newsSources, eq(newsSources.id, newsClusters.primarySourceId))
        .leftJoin(publisherSources, eq(publisherSources.sourceId, newsSources.id))
        .leftJoin(publishers, eq(publishers.id, publisherSources.publisherId))
        .where(where)
        .orderBy(desc(popularityExpr), desc(news.publishedAt))
        .limit(poolLimit)

      const mapped = mapRows(rows, 'POPULAR', opts.excludeArticleIds, opts.excludeClusterIds)
      return this.mergeWithLegacySupplement('POPULAR', mapped, opts)
    } catch {
      return this.fetchFirestoreFallback('POPULAR', { ...opts, needed: opts.limit })
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
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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

    const byId = new Map<string, FeedCandidateRow>()

    if (hasDatabaseUrl()) {
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

        for (const row of mapRows(rows, 'RECENT')) {
          byId.set(row.articleId, row)
        }
      } catch {
        /* fall through to Firestore hydrate */
      }
    }

    const missing = articleIds.filter((id) => !byId.has(id)).slice(0, FS_SUPPLEMENT_HARD_CAP)
    if (missing.length > 0) {
      try {
        const fs = getAdminFirestore()
        const refs = missing.map((id) => fs.collection(Collections.NEWS).doc(id))
        const snaps = await fs.getAll(...refs)
        for (const snap of snaps) {
          if (!snap.exists) continue
          const row = this.mapFirestoreDocToRow(snap.id, snap.data()!, 'RECENT')
          if (row) byId.set(row.articleId, row)
        }
      } catch (err) {
        console.warn('[feed] fetchByIds firestore hydrate failed:', err)
      }
    }

    return articleIds.map((id) => byId.get(id)).filter((r): r is FeedCandidateRow => Boolean(r))
  }

  async fetchDiscovery(opts: BaseQueryOpts): Promise<FeedCandidateRow[]> {
    const poolLimit = Math.max(opts.limit * 3, DEFAULT_POOL_SIZE)
    if (!hasDatabaseUrl()) {
      return this.fetchFirestoreFallback('DISCOVERY', { ...opts, needed: opts.limit })
    }

    try {
      const db = requireDb()
      const dk = dayKey()
      const where = and(
        publishedStatusWhere(),
        categoryFilterWhere(opts),
        cursorWhere(opts.cursor, opts.publishedBefore),
        excludeIdsWhere(opts)
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
        .map((r) => ({ ...r, sortScore: deterministicScore(r.articleId, dk) * 1_000_000_000 }))
      return this.mergeWithLegacySupplement('DISCOVERY', mapped, opts)
    } catch {
      return this.fetchFirestoreFallback('DISCOVERY', { ...opts, needed: opts.limit })
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
