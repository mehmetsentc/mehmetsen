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

export async function getCanonicalNewsBySlug(slug: string): Promise<Post | null> {
  const normalized = slug.trim()
  if (!normalized) return null

  let decoded = normalized
  try {
    decoded = decodeURIComponent(normalized).trim()
  } catch {}

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
    console.warn('[canonicalEligibility] getCanonicalPublishedNewsForSitemap error:', error)
    return []
  }
}
