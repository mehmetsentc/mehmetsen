import 'server-only'

import { and, desc, eq, isNotNull, lte, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import type { Post } from '@/types/post'
import { unstable_cache } from 'next/cache'

/**
 * Single source of truth for canonical public news eligibility (Phase P17.7H.3).
 *
 * PUBLIC CANONICAL:
 * - PostgreSQL canonical news table
 * - status = 'published'
 * - publishedAt is not null and <= NOW()
 * - not a test article (id not starting with 'test_', title not containing '[%TEST%]')
 * - not draft, pending, archived, banned
 *
 * NOT PUBLIC CANONICAL:
 * - legacy Firestore-only documents
 * - raw articles
 * - drafts
 * - archived / banned articles
 * - tests
 */

/** Where clause for public canonical news queries in PostgreSQL */
export function canonicalPublishedWhere() {
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

export interface CanonicalNewsRow {
  id: string
  legacyFirestoreId: string | null
  slug: string
  title: string
  summary: string | null
  description: string | null
  content: string | null
  htmlContent: string | null
  status: string
  categoryId: string | null
  citySlug: string | null
  cityName: string | null
  districtSlug: string | null
  districtName: string | null
  authorId: string | null
  authorDisplayName: string | null
  source: string | null
  sourceUrl: string | null
  thumbnailUrl: string | null
  coverImageUrl: string | null
  videoUrl: string | null
  tags: string[] | null
  isBreaking: boolean
  isFeatured: boolean
  isEditorPick: boolean
  seoTitle: string | null
  seoDescription: string | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export function canonicalRowToPost(row: CanonicalNewsRow): Post {
  const publishedAt = row.publishedAt ? row.publishedAt.toISOString() : new Date().toISOString()
  const createdAt = row.createdAt ? row.createdAt.toISOString() : publishedAt
  const updatedAt = row.updatedAt ? row.updatedAt.toISOString() : publishedAt

  const authorId = (row.authorId?.trim() || 'nahaber').slice(0, 128)
  const authorDisplayName = (row.authorDisplayName?.trim() || 'NaHaber').slice(0, 120)
  const imageUrl = row.coverImageUrl || row.thumbnailUrl || null

  const content = row.content || row.description || ''
  const summary = row.summary || content.slice(0, 280)

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content,
    summary,
    feedTeaser: summary.slice(0, 160),
    spot: summary.slice(0, 200),
    seoTitle: row.seoTitle || row.title,
    seoDescription: row.seoDescription || summary.slice(0, 300),
    seoKeywords: row.tags || [],
    authorId,
    authorUsername: authorId,
    authorDisplayName,
    authorPhotoURL: null,
    categoryId: row.categoryId || 'gundem',
    city: row.cityName,
    citySlug: row.citySlug,
    district: row.districtName,
    districtSlug: row.districtSlug,
    location: null,
    tags: row.tags || [],
    postType: row.videoUrl ? 'video' : 'news',
    source: row.source || authorDisplayName,
    mediaItems: imageUrl
      ? [
          {
            type: 'image',
            url: imageUrl,
            thumbnailUrl: imageUrl,
            caption: null,
            alt: row.title,
          },
        ]
      : [],
    coverImageUrl: imageUrl,
    status: 'published',
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: row.isEditorPick,
    featured: row.isFeatured,
    localFeatured: Boolean(row.citySlug),
    isTrending: false,
    isBreaking: row.isBreaking,
    priorityScore: 0,
    htmlContent: row.htmlContent || undefined,
    articleLayout: 'standard',
    articleFormat: 'standard',
    sourceUrl: row.sourceUrl || undefined,
    publishedAt,
    createdAt,
    updatedAt,
    fromCanonicalPg: true,
  } as Post
}

/**
 * Lookup canonical news by slug or ID from PostgreSQL.
 * Firestore is strictly bypassed to ensure publication safety.
 */
async function fetchCanonicalNewsBySlug(slug: string): Promise<Post | null> {
  if (!hasDatabaseUrl()) return null
  const db = getDb()

  try {
    const rows = await db
      .select()
      .from(news)
      .where(
        and(
          canonicalPublishedWhere(),
          or(
            eq(news.slug, slug),
            eq(news.id, slug),
            eq(news.legacyFirestoreId, slug)
          )
        )
      )
      .limit(1)

    if (rows.length === 0) return null
    return canonicalRowToPost(rows[0] as CanonicalNewsRow)
  } catch (error) {
    console.warn('[canonicalEligibility] fetchCanonicalNewsBySlug error:', error)
    return null
  }
}

export const getCanonicalNewsBySlugCached = unstable_cache(
  async (slug: string): Promise<Post | null> => {
    return fetchCanonicalNewsBySlug(slug)
  },
  ['canonical-news-by-slug-v1'],
  { revalidate: 60, tags: ['news-post', 'canonical-news'] }
)

/**
 * FinOps 3 Oct: the PG canonical table holds a handful of published rows (5 on 3 Oct),
 * yet every article render queried Postgres by slug (~27k lookups, ~0 hits) and kept
 * Neon awake between crawler ticks. Keep the small identity list in the shared data
 * cache for 30 minutes and only query by slug when it can match.
 */
const CANONICAL_IDENTITY_CAP = 5000

const getCanonicalIdentityList = unstable_cache(
  async (): Promise<string[] | null> => {
    if (!hasDatabaseUrl()) return []
    try {
      const rows = await getDb()
        .select({ id: news.id, slug: news.slug, legacyFirestoreId: news.legacyFirestoreId })
        .from(news)
        .where(canonicalPublishedWhere())
        .limit(CANONICAL_IDENTITY_CAP + 1)
      if (rows.length > CANONICAL_IDENTITY_CAP) return null
      const out: string[] = []
      for (const r of rows) {
        if (r.id) out.push(r.id)
        if (r.slug) out.push(r.slug)
        if (r.legacyFirestoreId) out.push(r.legacyFirestoreId)
      }
      return out
    } catch (error) {
      console.warn('[canonicalEligibility] identity list error:', error)
      return null
    }
  },
  ['canonical-news-identities-v1'],
  { revalidate: 1800, tags: ['canonical-news'] }
)

/**
 * FinOps 4 Oct: pg_stat_statements still showed ~12 identity-list queries/min after
 * 4c10e85, so the shared data cache is not holding it on this path. Keep an
 * in-process copy for the same 30 minutes as a floor.
 */
const CANONICAL_IDENTITY_MEMO_MS = 30 * 60 * 1000
let canonicalIdentityMemo: { at: number; value: string[] | null } | null = null

async function getCanonicalIdentityListMemo(): Promise<string[] | null> {
  const now = Date.now()
  if (canonicalIdentityMemo && now - canonicalIdentityMemo.at < CANONICAL_IDENTITY_MEMO_MS) {
    return canonicalIdentityMemo.value
  }
  const value = await getCanonicalIdentityList()
  // Do not pin an unavailable list (null) for 30 minutes; retry next time.
  if (value !== null) canonicalIdentityMemo = { at: now, value }
  return value
}

export async function getCanonicalNewsBySlug(slug: string): Promise<Post | null> {
  const normalized = slug.trim()
  if (!normalized) return null

  let decoded = normalized
  try {
    decoded = decodeURIComponent(normalized).trim()
  } catch {}

  const identities = await getCanonicalIdentityListMemo()
  // null = list unavailable or too large: fall back to the per-slug lookup.
  if (identities && !identities.includes(decoded) && !identities.includes(normalized)) {
    return null
  }

  const post = await getCanonicalNewsBySlugCached(decoded)
  if (!post && decoded !== normalized) {
    return getCanonicalNewsBySlugCached(normalized)
  }
  return post
}

/**
 * Fetch all canonical published news items for sitemaps.
 */
export async function getCanonicalPublishedNewsForSitemap(opts?: {
  limit?: number
  from?: Date
  to?: Date
  citySlug?: string
  /**
   * SEO-1C.1 — permanent article sitemaps must not cache a DB outage as an
   * empty month. When true, query errors propagate instead of returning [].
   */
  throwOnError?: boolean
}): Promise<CanonicalNewsRow[]> {
  if (!hasDatabaseUrl()) return []
  const db = getDb()

  try {
    const conditions = [canonicalPublishedWhere()]
    if (opts?.from) conditions.push(sql`${news.publishedAt} >= ${opts.from}`)
    if (opts?.to) conditions.push(sql`${news.publishedAt} < ${opts.to}`)
    if (opts?.citySlug) conditions.push(eq(news.citySlug, opts.citySlug))

    const query = db
      .select()
      .from(news)
      .where(and(...conditions))
      .orderBy(desc(news.publishedAt))
      .limit(opts?.limit ?? 500)

    const rows = await query
    return rows as CanonicalNewsRow[]
  } catch (error) {
    if (opts?.throwOnError) throw error
    console.warn('[canonicalEligibility] getCanonicalPublishedNewsForSitemap error:', error)
    return []
  }
}

/**
 * SEO-1C.1 — identity keys that `/haber/[slug]` resolves to PostgreSQL first
 * (`fetchCanonicalNewsBySlug` matches slug, id or legacyFirestoreId). A
 * Firestore article whose slug hits one of these keys is served from PG, so the
 * article sitemap must not emit it from Firestore as well. Errors propagate.
 */
export async function getCanonicalPublishedIdentityKeys(): Promise<string[]> {
  if (!hasDatabaseUrl()) return []
  const db = getDb()
  const rows = await db
    .select({ id: news.id, slug: news.slug, legacyFirestoreId: news.legacyFirestoreId })
    .from(news)
    .where(canonicalPublishedWhere())
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of [row.id, row.slug, row.legacyFirestoreId]) {
      const k = typeof key === 'string' ? key.trim() : ''
      if (k) keys.add(k)
    }
  }
  return [...keys]
}

/**
 * SEO-1C.1 — distinct UTC `YYYY-MM` months that contain canonical published
 * PostgreSQL news. Uses the (status, published_at) index; errors propagate.
 */
export async function getCanonicalPublishedMonthKeysUtc(): Promise<string[]> {
  if (!hasDatabaseUrl()) return []
  const db = getDb()
  const month = sql<string>`to_char(${news.publishedAt} at time zone 'UTC', 'YYYY-MM')`
  const rows = await db.selectDistinct({ month }).from(news).where(canonicalPublishedWhere())
  return rows
    .map((row) => (typeof row.month === 'string' ? row.month : ''))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
}
