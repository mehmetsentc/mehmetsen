/**
 * City-specific news service — reads from Firebase (citySlug filter) or Postgres
 * (news_locations) depending on POSTGRES_READS_ENABLED flag.
 *
 * Firebase path: queries existing `news` collection where `citySlug === '<provinceSlug>'`
 * Postgres path: joins news + news_locations for city-scoped rows (behind flag)
 */

import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import type { NewsItem } from '@/types/newsItem'
import { getCategoryFamily } from '@/constants/config'
import { isPostgresReadsEnabled } from '@/db'

interface NewsDocument {
  title?: string
  slug?: string
  description?: string
  coverImageUrl?: string
  thumbnail?: string
  categoryId?: string
  category?: string
  status?: string
  publishedAt?: number | { _seconds?: number }
  citySlug?: string
  city?: string
  views?: number
  likesCount?: number
  commentsCount?: number
  isBreaking?: boolean
  source?: string
  articleFormat?: string
  seoTitle?: string
  videoUrl?: string
  readingMinutes?: number
}

function docToNewsItem(id: string, data: NewsDocument): NewsItem | null {
  const title = data.title?.trim()
  if (!title) return null

  let publishedAt: string | undefined
  if (typeof data.publishedAt === 'number' && data.publishedAt > 0) {
    publishedAt = new Date(data.publishedAt).toISOString()
  } else if (data.publishedAt && typeof (data.publishedAt as { _seconds?: number })._seconds === 'number') {
    publishedAt = new Date((data.publishedAt as { _seconds: number })._seconds * 1000).toISOString()
  }

  return {
    id,
    slug: data.slug?.trim() || id,
    title,
    description: data.description?.trim(),
    imageUrl: data.coverImageUrl?.trim() || data.thumbnail?.trim() || undefined,
    videoUrl: data.videoUrl?.trim() || undefined,
    category: data.categoryId?.trim() || data.category?.trim() || undefined,
    source: data.source?.trim() || undefined,
    city: data.city?.trim() || undefined,
    publishedAt,
    views: data.views,
    likesCount: data.likesCount,
    commentsCount: data.commentsCount,
    breaking: data.isBreaking,
    articleFormat: data.articleFormat as NewsItem['articleFormat'],
    seoTitle: data.seoTitle?.trim(),
    readingMinutes: data.readingMinutes,
  }
}

async function getCityNewsFromPostgres(citySlug: string, limitCount: number): Promise<NewsItem[]> {
  try {
    const { getDb, schema } = await import('@/db')
    const { eq, and, desc } = await import('drizzle-orm')
    const db = getDb()

    const rows = await db
      .select({
        id: schema.news.id,
        slug: schema.news.slug,
        title: schema.news.title,
        description: schema.news.description,
        coverImageUrl: schema.news.coverImageUrl,
        thumbnailUrl: schema.news.thumbnailUrl,
        videoUrl: schema.news.videoUrl,
        categoryId: schema.news.categoryId,
        source: schema.news.source,
        cityName: schema.news.cityName,
        publishedAt: schema.news.publishedAt,
        viewsCount: schema.news.viewsCount,
        likesCount: schema.news.likesCount,
        commentsCount: schema.news.commentsCount,
        isBreaking: schema.news.isBreaking,
        articleFormat: schema.news.articleFormat,
        seoTitle: schema.news.seoTitle,
      })
      .from(schema.news)
      .where(
        and(
          eq(schema.news.status, 'published'),
          eq(schema.news.citySlug, citySlug)
        )
      )
      .orderBy(desc(schema.news.publishedAt))
      .limit(limitCount)

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description ?? undefined,
      imageUrl: r.coverImageUrl ?? r.thumbnailUrl ?? undefined,
      videoUrl: r.videoUrl ?? undefined,
      category: r.categoryId ?? undefined,
      source: r.source ?? undefined,
      city: r.cityName ?? undefined,
      publishedAt: r.publishedAt?.toISOString(),
      views: r.viewsCount,
      likesCount: r.likesCount,
      commentsCount: r.commentsCount,
      breaking: r.isBreaking,
      articleFormat: r.articleFormat as NewsItem['articleFormat'],
      seoTitle: r.seoTitle ?? undefined,
    }))
  } catch (error) {
    console.warn('[cityNewsService] Postgres read failed, falling back to Firebase:', error)
    return []
  }
}

const getCityNewsCached = unstable_cache(
  async (citySlug: string, limitCount: number) => {
    if (isPostgresReadsEnabled()) {
      const pgItems = await getCityNewsFromPostgres(citySlug, limitCount)
      if (pgItems.length > 0) return pgItems
    }

    try {
      const db = getAdminFirestore()
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('citySlug', '==', citySlug)
        .orderBy('publishedAt', 'desc')
        .limit(limitCount)
        .get()

      const items: NewsItem[] = []
      for (const doc of snap.docs) {
        const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
        if (item) items.push(item)
      }
      return items
    } catch (error) {
      console.warn('[cityNewsService] getCityNews failed:', error)
      return []
    }
  },
  ['city-news-feed-v2'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Fetch published news for a city (province slug), newest first.
 * Uses Postgres when POSTGRES_READS_ENABLED=true, otherwise Firebase.
 */
export async function getCityNews(
  citySlug: string,
  limit = 30
): Promise<NewsItem[]> {
  return getCityNewsCached(citySlug.trim().toLowerCase(), limit)
}

const getCityNewsByCategoryCached = unstable_cache(
  async (citySlug: string, categoryId: string, limitCount: number) => {
    try {
      const db = getAdminFirestore()
      const family = getCategoryFamily(categoryId)

      let q = db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('citySlug', '==', citySlug)

      q = family.length > 1
        ? q.where('categoryId', 'in', family)
        : q.where('categoryId', '==', categoryId)

      const snap = await q
        .orderBy('publishedAt', 'desc')
        .limit(limitCount)
        .get()

      const items: NewsItem[] = []
      for (const doc of snap.docs) {
        const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
        if (item) items.push(item)
      }
      return items
    } catch (error) {
      console.warn('[cityNewsService] getCityNewsByCategory failed:', error)
      return []
    }
  },
  ['city-news-category-v1'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Fetch published news for a city + category, newest first.
 */
export async function getCityNewsByCategory(
  citySlug: string,
  categoryId: string,
  limit = 30
): Promise<NewsItem[]> {
  return getCityNewsByCategoryCached(
    citySlug.trim().toLowerCase(),
    categoryId.trim().toLowerCase(),
    limit
  )
}

const getCityNewsByDistrictCached = unstable_cache(
  async (citySlug: string, districtSlug: string, limitCount: number) => {
    try {
      const db = getAdminFirestore()
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('citySlug', '==', citySlug)
        .where('districtSlug', '==', districtSlug)
        .orderBy('publishedAt', 'desc')
        .limit(limitCount)
        .get()

      const items: NewsItem[] = []
      for (const doc of snap.docs) {
        const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
        if (item) items.push(item)
      }

      if (items.length === 0) {
        const fallback = await db
          .collection(NEWS_COLLECTION)
          .where('status', '==', 'published')
          .where('citySlug', '==', citySlug)
          .orderBy('publishedAt', 'desc')
          .limit(limitCount)
          .get()

        for (const doc of fallback.docs) {
          const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
          if (item) items.push(item)
        }
      }
      return items
    } catch (error) {
      console.warn('[cityNewsService] getCityNewsByDistrict failed:', error)
      return []
    }
  },
  ['city-news-district-v1'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Fetch published news for a city + district, newest first.
 * Falls back to city-wide news if no district-specific results.
 */
export async function getCityNewsByDistrict(
  citySlug: string,
  districtSlug: string,
  limit = 30
): Promise<NewsItem[]> {
  return getCityNewsByDistrictCached(
    citySlug.trim().toLowerCase(),
    districtSlug.trim().toLowerCase(),
    limit
  )
}
