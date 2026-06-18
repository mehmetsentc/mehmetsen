import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { docToNewsItem, sortNewsByDate } from '@/lib/newsItemUtils'
import { getCategoryFamily } from '@/constants/config'
import type { Post } from '@/types/post'
import type { FeedSliderItem } from '@/types/feedSlider'
import type { HomeFeedInitialData, HomeCategorySlug, NewsItem } from '@/types/newsItem'
import { HOME_CATEGORY_RAILS } from '@/types/newsItem'

export type { FeedSliderItem }

function mapSliderItem(id: string, data: NewsDocument): FeedSliderItem | null {
  const title = data.title?.trim()
  if (!title) return null

  const raw =
    data.coverImageUrl?.trim() ||
    data.thumbnail?.trim() ||
    null

  return {
    id,
    title,
    slug: data.slug?.trim() || id,
    imageUrl: raw && raw.length > 5 ? raw : null,
    categoryId: data.categoryId?.trim() || data.category?.trim() || '',
    publishedAt: Number(data.publishedAt ?? 0),
    sourceUrl: data.sourceUrl?.trim() || null,
  }
}

async function queryPublishedByCategory(
  categoryId: string,
  itemLimit: number
): Promise<QueryDocumentSnapshot[]> {
  const db = getAdminFirestore()

  try {
    const family = getCategoryFamily(categoryId)
    const baseQuery = db.collection(NEWS_COLLECTION).where('status', '==', 'published')
    const snap = await (
      family.length > 1
        ? baseQuery.where('categoryId', 'in', family)
        : baseQuery.where('categoryId', '==', categoryId)
    )
      .orderBy('publishedAt', 'desc')
      .limit(itemLimit)
      .get()
    return snap.docs
  } catch (error) {
    // RESOURCE_EXHAUSTED (Firestore kota doldu) veya başka Firestore hatası —
    // fallback query yapmak kotayı daha da zorlar, boş dizi döndür.
    const code = (error as { code?: number }).code
    if (code === 8) {
      console.warn('[newsService.server] Firestore quota exceeded (RESOURCE_EXHAUSTED) — returning []')
      return []
    }
    console.warn('[newsService.server] category query failed — returning []:', error)
    return []
  }
}

const BREAKING_FRESH_WINDOW_MS = 2 * 60 * 60 * 1000

function isFreshBreakingItem(publishedAt: number, now = Date.now()): boolean {
  if (!publishedAt) return false
  return now - publishedAt <= BREAKING_FRESH_WINDOW_MS
}

/** Son dakika slider — isBreaking veya son-dakika kategorisi, son 2 saat. */
export async function getBreakingSliderItems(itemLimit = 5): Promise<FeedSliderItem[]> {
  const db = getAdminFirestore()
  const now = Date.now()
  const scanLimit = Math.max(itemLimit * 4, 20)

  const collectFresh = (docs: QueryDocumentSnapshot[]): FeedSliderItem[] =>
    docs
      .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
      .filter((item): item is FeedSliderItem => item !== null)
      .filter((item) => isFreshBreakingItem(item.publishedAt, now))
      .slice(0, itemLimit)

  try {
    const breakingSnap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('isBreaking', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(scanLimit)
      .get()

    const fromBreaking = collectFresh(breakingSnap.docs)
    if (fromBreaking.length > 0) return fromBreaking
  } catch (error) {
    console.warn('[newsService.server] breaking slider query failed:', error)
  }

  try {
    const categorySnap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('categoryId', '==', 'son-dakika')
      .orderBy('publishedAt', 'desc')
      .limit(scanLimit)
      .get()

    return collectFresh(categorySnap.docs)
  } catch (error) {
    console.warn('[newsService.server] son-dakika slider query failed:', error)
    return []
  }
}

export async function getFeedSliderItems(
  categoryId: string,
  itemLimit = 5
): Promise<FeedSliderItem[]> {
  const docs = await queryPublishedByCategory(categoryId, itemLimit + 8)
  return docs
    .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
    .filter((item): item is FeedSliderItem => item !== null)
    .filter((item) => item.categoryId !== 'son-dakika')
    .slice(0, itemLimit)
}

export async function getFeedTimelinePosts(
  categoryId: string,
  itemLimit = 10,
  feedSource: FeedSource = 'nahaber'
): Promise<Post[]> {
  const docs = await queryPublishedByCategory(categoryId, itemLimit + 5)
  const posts = docs
    .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
    .filter((post): post is Post => post !== null)
    .filter((post) => isPubliclyVisibleStatus(post.status))

  return filterPostsByFeedSource(posts, feedSource).slice(0, itemLimit)
}

export async function getNewsById(id: string): Promise<Post | null> {
  try {
    const snap = await getAdminFirestore().collection(NEWS_COLLECTION).doc(id).get()
    if (!snap.exists) return null
    return newsDocToPost(snap.id, snap.data() as NewsDocument)
  } catch (error) {
    console.warn('[newsService.server] getNewsById failed:', error)
    return null
  }
}

export async function getNewsBySlug(slug: string): Promise<Post | null> {
  const normalized = slug.trim()
  if (!normalized) return null

  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('slug', '==', normalized)
      .limit(1)
      .get()

    if (!snap.empty) {
      const doc = snap.docs[0]!
      return newsDocToPost(doc.id, doc.data() as NewsDocument)
    }
  } catch (error) {
    console.warn('[newsService.server] getNewsBySlug query failed:', error)
  }

  return getNewsById(normalized)
}

function mapAdminDocs(docs: QueryDocumentSnapshot[]): NewsItem[] {
  return docs
    .map((doc) => docToNewsItem(doc.id, doc.data() as Record<string, unknown>))
    .filter((item): item is NewsItem => item !== null)
}

async function adminPublishedQuery(
  build: (base: FirebaseFirestore.Query) => FirebaseFirestore.Query,
  scanLimit: number
): Promise<NewsItem[]> {
  try {
    const db = getAdminFirestore()
    const base = db.collection(NEWS_COLLECTION).where('status', '==', 'published')
    const snap = await build(base).orderBy('publishedAt', 'desc').limit(scanLimit).get()
    return mapAdminDocs(snap.docs)
  } catch (error) {
    console.warn('[newsService.server] adminPublishedQuery failed:', error)
    return []
  }
}

export async function getHomeBreakingNews(limitCount = 12): Promise<NewsItem[]> {
  const scanLimit = Math.max(limitCount * 3, 24)
  const fromBreaking = await adminPublishedQuery(
    (q) => q.where('isBreaking', '==', true),
    scanLimit
  )
  if (fromBreaking.length >= limitCount) return fromBreaking.slice(0, limitCount)

  const fromCategory = await adminPublishedQuery(
    (q) => q.where('categoryId', '==', 'son-dakika'),
    scanLimit
  )
  const merged = sortNewsByDate(
    [...fromBreaking, ...fromCategory].filter(
      (item, index, arr) => arr.findIndex((x) => x.id === item.id) === index
    )
  )
  return merged.slice(0, limitCount)
}

export async function getHomeFeaturedNews(limitCount = 8): Promise<NewsItem[]> {
  const scanLimit = Math.max(limitCount * 3, 24)
  const fromFeatured = await adminPublishedQuery((q) => q.where('featured', '==', true), scanLimit)
  if (fromFeatured.length >= limitCount) return fromFeatured.slice(0, limitCount)

  const fromGundem = await adminPublishedQuery((q) => q.where('categoryId', '==', 'gundem'), scanLimit)
  const merged = sortNewsByDate(
    [...fromFeatured, ...fromGundem].filter(
      (item, index, arr) => arr.findIndex((x) => x.id === item.id) === index
    )
  )
  return merged.slice(0, limitCount)
}

export async function getHomeLatestNews(limitCount = 20): Promise<NewsItem[]> {
  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get()
    return mapAdminDocs(snap.docs)
  } catch (error) {
    console.warn('[newsService.server] getHomeLatestNews createdAt index fallback:', error)
    return adminPublishedQuery((q) => q, limitCount)
  }
}

export async function getHomeMostReadNews(limitCount = 6): Promise<NewsItem[]> {
  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .orderBy('viewsCount', 'desc')
      .limit(limitCount)
      .get()
    const items = mapAdminDocs(snap.docs)
    if (items.length > 0) return items
  } catch (error) {
    console.warn('[newsService.server] getHomeMostReadNews viewsCount index fallback:', error)
  }
  return getHomeLatestNews(limitCount)
}

export async function getHomeCategoryRails(): Promise<Partial<Record<HomeCategorySlug, NewsItem[]>>> {
  const entries = await Promise.all(
    HOME_CATEGORY_RAILS.map(async (category) => {
      const items = await adminPublishedQuery(
        (q) => {
          const family = getCategoryFamily(category)
          return family.length > 1 ? q.where('categoryId', 'in', family) : q.where('categoryId', '==', category)
        },
        10
      )
      return [category, items] as const
    })
  )

  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const [category, items] of entries) {
    if (items.length > 0) rails[category] = items
  }
  return rails
}

export async function getHomeLocalNews(citySlug: string, limitCount = 8): Promise<NewsItem[]> {
  const normalized = citySlug.trim().toLowerCase()
  if (!normalized) return []

  const bySlug = await adminPublishedQuery((q) => q.where('citySlug', '==', normalized), limitCount)
  if (bySlug.length > 0) return bySlug

  const yerel = await adminPublishedQuery((q) => q.where('categoryId', '==', 'yerel-haber'), limitCount * 3)
  return yerel
    .filter((item) => {
      const city = item.city?.toLowerCase() ?? item.locationCity?.toLowerCase() ?? ''
      return city.includes(normalized)
    })
    .slice(0, limitCount)
}

export async function getHomeFeedInitialData(): Promise<HomeFeedInitialData> {
  const [breaking, featured, latest, mostRead, categoryRails] = await Promise.all([
    getHomeBreakingNews(12),
    getHomeFeaturedNews(8),
    getHomeLatestNews(20),
    getHomeMostReadNews(6),
    getHomeCategoryRails(),
  ])

  return { breaking, featured, latest, mostRead, categoryRails }
}
