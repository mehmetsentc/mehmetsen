import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { docToNewsItem } from '@/lib/newsItemUtils'
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

/** In-process fallback — RESOURCE_EXHAUSTED durumunda son başarılı sonuç. */
let lastSuccessfulPool: NewsItem[] | null = null
let lastSuccessfulPoolAt = 0

/**
 * Tek geniş sorgu — son `poolSize` published haberi tek seferde çeker.
 * Tüm ana sayfa bucket'ları (breaking, featured, latest, mostRead, kategori rails)
 * bu havuzdan üretilir — 19 paralel Firestore çağrısı yerine yalnızca 1 çağrı.
 *
 * `unstable_cache` ile aynı poolSize için 60 saniye boyunca tek sorgu yapılır;
 * Firestore RESOURCE_EXHAUSTED dönerse in-process son başarılı sonucu kullanır.
 */
async function fetchHomeNewsPool(poolSize: number): Promise<NewsItem[]> {
  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(poolSize)
      .get()
    const items = mapAdminDocs(snap.docs)
    if (items.length > 0) {
      lastSuccessfulPool = items
      lastSuccessfulPoolAt = Date.now()
    }
    return items
  } catch (error) {
    const code = (error as { code?: number }).code
    const message = error instanceof Error ? error.message : String(error)
    if (code === 8 || message.includes('RESOURCE_EXHAUSTED')) {
      console.warn('[newsService.server] pool quota exhausted; serving cached fallback')
    } else {
      console.warn('[newsService.server] getHomeNewsPool failed:', error)
    }
    if (lastSuccessfulPool && Date.now() - lastSuccessfulPoolAt < 30 * 60 * 1000) {
      return lastSuccessfulPool
    }
    return []
  }
}

const getHomeNewsPoolCached = unstable_cache(
  async (poolSize: number) => fetchHomeNewsPool(poolSize),
  ['home-news-pool-v1'],
  { revalidate: 60, tags: ['home-feed'] }
)

async function getHomeNewsPool(poolSize = 300): Promise<NewsItem[]> {
  return getHomeNewsPoolCached(poolSize)
}

function isBreakingPoolItem(item: NewsItem): boolean {
  return item.breaking === true || item.category === 'son-dakika'
}

function bucketBreaking(pool: NewsItem[], limit: number): NewsItem[] {
  return pool.filter(isBreakingPoolItem).slice(0, limit)
}

function bucketFeatured(pool: NewsItem[], limit: number): NewsItem[] {
  // Önce explicit featured + gundem; yetmezse pool top'tan tamamla
  const featured = pool.filter((p) => p.featured === true && !isBreakingPoolItem(p))
  const gundem = pool.filter((p) => p.category === 'gundem' && !isBreakingPoolItem(p))
  const candidates = [...featured, ...gundem]
  const seen = new Set<string>()
  const result: NewsItem[] = []
  for (const item of candidates) {
    if (seen.has(item.id)) continue
    if (!item.imageUrl) continue
    seen.add(item.id)
    result.push(item)
    if (result.length >= limit) break
  }
  if (result.length < limit) {
    for (const item of pool) {
      if (seen.has(item.id) || !item.imageUrl || isBreakingPoolItem(item)) continue
      seen.add(item.id)
      result.push(item)
      if (result.length >= limit) break
    }
  }
  return result
}

function bucketLatest(pool: NewsItem[], limit: number): NewsItem[] {
  return pool.filter((item) => !isBreakingPoolItem(item)).slice(0, limit)
}

function bucketMostRead(pool: NewsItem[], limit: number): NewsItem[] {
  const withViews = pool.filter((p) => typeof p.views === 'number' && (p.views ?? 0) > 0)
  if (withViews.length === 0) return pool.slice(0, limit)
  return [...withViews]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, limit)
}

function bucketCategoryRails(pool: NewsItem[], perCategory = 10): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const category of HOME_CATEGORY_RAILS) {
    const family = new Set(getCategoryFamily(category))
    const items = pool
      .filter((item) => item.category && family.has(item.category))
      .slice(0, perCategory)
    if (items.length > 0) rails[category] = items
  }
  return rails
}

/**
 * Tek Firestore sorgusu ile ana sayfanın ihtiyaç duyduğu tüm bucket'ları üretir.
 * Önceki implementasyon ~19 ayrı admin sorgusu yapıyordu (TTFB 5-15s); şimdi 1.
 */
export async function getHomeFeedInitialData(): Promise<HomeFeedInitialData> {
  const pool = await getHomeNewsPool(300)

  if (pool.length === 0) {
    return {
      breaking: [],
      featured: [],
      latest: [],
      mostRead: [],
      categoryRails: {},
    }
  }

  return {
    breaking: bucketBreaking(pool, 12),
    featured: bucketFeatured(pool, 8),
    latest: bucketLatest(pool, 20),
    mostRead: bucketMostRead(pool, 6),
    categoryRails: bucketCategoryRails(pool, 10),
  }
}

/** Tek bir kategori için ek sorgu — pool'da yetersizse client tarafından çağrılır. */
export async function getHomeCategoryItems(category: string, limitCount = 10): Promise<NewsItem[]> {
  try {
    const db = getAdminFirestore()
    const family = getCategoryFamily(category)
    const base = db.collection(NEWS_COLLECTION).where('status', '==', 'published')
    const snap = await (
      family.length > 1
        ? base.where('categoryId', 'in', family)
        : base.where('categoryId', '==', category)
    )
      .orderBy('publishedAt', 'desc')
      .limit(limitCount)
      .get()
    return mapAdminDocs(snap.docs)
  } catch (error) {
    console.warn('[newsService.server] getHomeCategoryItems failed:', category, error)
    return []
  }
}

export async function getHomeLocalNews(citySlug: string, limitCount = 8): Promise<NewsItem[]> {
  const normalized = citySlug.trim().toLowerCase()
  if (!normalized) return []

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('citySlug', '==', normalized)
      .orderBy('publishedAt', 'desc')
      .limit(limitCount)
      .get()
    return mapAdminDocs(snap.docs)
  } catch (error) {
    console.warn('[newsService.server] getHomeLocalNews failed:', error)
    return []
  }
}
