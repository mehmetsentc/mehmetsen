/**
 * City-specific news service — reads from existing Firebase, filtered by citySlug.
 * This is Phase 6 safe: no Postgres reads, no new collections, just filtered queries
 * on the existing `news` collection where `citySlug === '<provinceSlug>'`.
 */

import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import type { NewsItem } from '@/types/newsItem'
import { getCategoryFamily } from '@/constants/config'

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

const getCityNewsCached = unstable_cache(
  async (citySlug: string, limitCount: number) => {
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
  ['city-news-feed-v1'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Fetch published news for a city (province slug), newest first.
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
