import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { docToNewsItem, sortNewsByDate } from '@/lib/newsItemUtils'
import { isNationalFeaturedEligible } from '@/lib/featuredScope'
import { getCategoryFamily } from '@/constants/config'
import type { NewsItem } from '@/types/newsItem'
import type { NaEvent } from '@/types/event'

function mapDocs(docs: QueryDocumentSnapshot[]): NewsItem[] {
  return docs
    .map((doc) => docToNewsItem(doc.id, doc.data() as Record<string, unknown>))
    .filter((item): item is NewsItem => item !== null)
}

function isBreakingItem(item: NewsItem): boolean {
  return item.breaking === true || item.category === 'son-dakika'
}

async function queryPublished(
  constraints: Parameters<typeof query>[1][],
  scanLimit: number
): Promise<NewsItem[]> {
  try {
    const snap = await getDocs(
      query(collection(db, NEWS_COLLECTION), where('status', '==', 'published'), ...constraints, limit(scanLimit))
    )
    return mapDocs(snap.docs)
  } catch (error) {
    console.warn('[lib/news] query failed:', error)
    return []
  }
}

/** Latest published news ordered by createdAt desc. */
export async function getLatestNews(limitCount = 20): Promise<NewsItem[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, NEWS_COLLECTION),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    )
    return mapDocs(snap.docs)
  } catch (error) {
    console.warn('[lib/news] getLatestNews index may be required (status, createdAt):', error)
    try {
      const snap = await getDocs(
        query(
          collection(db, NEWS_COLLECTION),
          where('status', '==', 'published'),
          orderBy('publishedAt', 'desc'),
          limit(limitCount)
        )
      )
      return mapDocs(snap.docs)
    } catch (fallbackError) {
      console.warn('[lib/news] getLatestNews fallback failed:', fallbackError)
      return []
    }
  }
}

/** Breaking news — isBreaking / breaking flag or son-dakika category. */
export async function getBreakingNews(limitCount = 12): Promise<NewsItem[]> {
  const scanLimit = Math.max(limitCount * 3, 24)

  const fromBreaking = await queryPublished(
    [where('isBreaking', '==', true), orderBy('publishedAt', 'desc')],
    scanLimit
  )
  if (fromBreaking.length >= limitCount) {
    return fromBreaking.slice(0, limitCount)
  }

  const fromCategory = await queryPublished(
    [where('categoryId', '==', 'son-dakika'), orderBy('publishedAt', 'desc')],
    scanLimit
  )

  const merged = sortNewsByDate(
    [...fromBreaking, ...fromCategory].filter(
      (item, index, arr) => arr.findIndex((x) => x.id === item.id) === index
    )
  )

  if (merged.length > 0) return merged.slice(0, limitCount)

  try {
    const snap = await getDocs(
      query(
        collection(db, NEWS_COLLECTION),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc'),
        limit(scanLimit)
      )
    )
    return mapDocs(snap.docs).filter(isBreakingItem).slice(0, limitCount)
  } catch (error) {
    console.warn('[lib/news] getBreakingNews scan failed:', error)
    return []
  }
}

/** Featured agenda slider — yalnızca CMS Öne Çıkan (ulusal; yerel pinler hariç). */
export async function getFeaturedNews(limitCount = 10): Promise<NewsItem[]> {
  const scanLimit = Math.max(limitCount * 5, 40)

  const fromFeatured = await queryPublished(
    [where('featured', '==', true), orderBy('publishedAt', 'desc')],
    scanLimit
  )
  return fromFeatured
    .filter((item) =>
      isNationalFeaturedEligible({ citySlug: item.citySlug, category: item.category })
    )
    .slice(0, limitCount)
}

/** Category rail items. */
export async function getNewsByCategory(category: string, limitCount = 10): Promise<NewsItem[]> {
  const family = getCategoryFamily(category)
  const scanLimit = Math.max(limitCount * 2, 20)

  if (family.length > 1) {
    const items = await queryPublished(
      [where('categoryId', 'in', family), orderBy('publishedAt', 'desc')],
      scanLimit
    )
    return items.slice(0, limitCount)
  }

  const items = await queryPublished(
    [where('categoryId', '==', category), orderBy('publishedAt', 'desc')],
    scanLimit
  )
  return items.slice(0, limitCount)
}

/** Most read — viewsCount desc with latest fallback. */
export async function getMostReadNews(limitCount = 6): Promise<NewsItem[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, NEWS_COLLECTION),
        where('status', '==', 'published'),
        orderBy('viewsCount', 'desc'),
        limit(limitCount)
      )
    )
    const items = mapDocs(snap.docs)
    if (items.length > 0) return items
  } catch (error) {
    console.warn('[lib/news] getMostReadNews index may be required (status, viewsCount):', error)
  }

  return getLatestNews(limitCount)
}

/** Local news by city slug or city name fields. */
export async function getLocalNews(city: string, limitCount = 8): Promise<NewsItem[]> {
  const normalized = city.trim().toLowerCase()
  if (!normalized) return []

  try {
    const bySlug = await queryPublished(
      [where('citySlug', '==', normalized), orderBy('publishedAt', 'desc')],
      limitCount
    )
    if (bySlug.length > 0) return bySlug
  } catch (error) {
    console.warn('[lib/news] getLocalNews citySlug query failed:', error)
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, NEWS_COLLECTION),
        where('status', '==', 'published'),
        where('categoryId', '==', 'yerel-haber'),
        orderBy('publishedAt', 'desc'),
        limit(limitCount * 3)
      )
    )
    const items = mapDocs(snap.docs).filter((item) => {
      const slug = item.city?.toLowerCase() ?? item.locationCity?.toLowerCase() ?? ''
      return slug.includes(normalized) || normalized.includes(slug)
    })
    return items.slice(0, limitCount)
  } catch (error) {
    console.warn('[lib/news] getLocalNews fallback failed:', error)
    return []
  }
}

/** Local events — delegates to events collection by citySlug. */
export async function getLocalEvents(city: string, limitCount = 6): Promise<NaEvent[]> {
  const normalized = city.trim().toLowerCase()
  if (!normalized) return []

  try {
    const { eventService } = await import('@/services/eventService')
    const result = await eventService.getEvents({ citySlug: normalized, timeRange: 'upcoming' })
    return result.events.slice(0, limitCount)
  } catch (error) {
    console.warn('[lib/news] getLocalEvents failed:', error)
    return []
  }
}
