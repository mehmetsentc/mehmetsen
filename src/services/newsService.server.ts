import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { docToNewsItem } from '@/lib/newsItemUtils'
import { getCategoryFamily } from '@/constants/config'
import { pickTrending, rankFeedHotAware } from '@/lib/feedRanking'
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

async function fetchBreakingSliderRaw(scanLimit: number): Promise<FeedSliderItem[]> {
  const db = getAdminFirestore()
  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('isBreaking', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(scanLimit)
      .get()
    const items = snap.docs
      .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
      .filter((item): item is FeedSliderItem => item !== null)
    if (items.length > 0) return items
  } catch (error) {
    console.warn('[newsService.server] breaking slider query failed:', error)
  }
  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('categoryId', '==', 'son-dakika')
      .orderBy('publishedAt', 'desc')
      .limit(scanLimit)
      .get()
    return snap.docs
      .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
      .filter((item): item is FeedSliderItem => item !== null)
  } catch (error) {
    console.warn('[newsService.server] son-dakika slider query failed:', error)
    return []
  }
}

const getBreakingSliderCached = unstable_cache(
  (scanLimit: number) => fetchBreakingSliderRaw(scanLimit),
  ['breaking-slider-v1'],
  { revalidate: 120, tags: ['breaking-news'] }
)

export async function getBreakingSliderItems(itemLimit = 5): Promise<FeedSliderItem[]> {
  const scanLimit = Math.max(itemLimit * 4, 20)
  const now = Date.now()
  const raw = await getBreakingSliderCached(scanLimit)
  return raw.filter((item) => isFreshBreakingItem(item.publishedAt, now)).slice(0, itemLimit)
}

const getFeedSliderCached = unstable_cache(
  async (categoryId: string, fetchLimit: number) => {
    const docs = await queryPublishedByCategory(categoryId, fetchLimit)
    return docs
      .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
      .filter((item): item is FeedSliderItem => item !== null)
      .filter((item) => item.categoryId !== 'son-dakika')
  },
  ['feed-slider-v1'],
  { revalidate: 300, tags: ['feed-slider'] }
)

export async function getFeedSliderItems(
  categoryId: string,
  itemLimit = 5
): Promise<FeedSliderItem[]> {
  const items = await getFeedSliderCached(categoryId, itemLimit + 8)
  return items.slice(0, itemLimit)
}

const getFeedTimelineCached = unstable_cache(
  async (categoryId: string, fetchLimit: number, feedSource: FeedSource) => {
    const docs = await queryPublishedByCategory(categoryId, fetchLimit)
    const posts = docs
      .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
      .filter((post): post is Post => post !== null)
      .filter((post) => isPubliclyVisibleStatus(post.status))
    return filterPostsByFeedSource(posts, feedSource)
  },
  ['feed-timeline-v1'],
  { revalidate: 300, tags: ['feed-timeline'] }
)

export async function getFeedTimelinePosts(
  categoryId: string,
  itemLimit = 10,
  feedSource: FeedSource = 'nahaber'
): Promise<Post[]> {
  const posts = await getFeedTimelineCached(categoryId, itemLimit + 5, feedSource)
  return posts.slice(0, itemLimit)
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

let lastSuccessfulPool: NewsItem[] | null = null
let lastSuccessfulPoolAt = 0

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
  ['home-news-pool-v2'],
  { revalidate: 300, tags: ['home-feed'] }
)

async function getHomeNewsPool(poolSize = 150): Promise<NewsItem[]> {
  return getHomeNewsPoolCached(poolSize)
}

function isBreakingPoolItem(item: NewsItem): boolean {
  return item.breaking === true || item.category === 'son-dakika'
}

function bucketBreaking(pool: NewsItem[], limit: number): NewsItem[] {
  return pool.filter(isBreakingPoolItem).slice(0, limit)
}

function bucketFeatured(pool: NewsItem[], limit: number): NewsItem[] {
  // Slider: SADECE featured=true veya kategori=gundem olan haberler
  const featured = pool.filter((p) => p.featured === true && !isBreakingPoolItem(p))
  const gundem = pool.filter((p) => p.category === 'gundem' && !isBreakingPoolItem(p))
  const candidates = [...featured, ...gundem]
  const seen = new Set<string>()
  const withImg: NewsItem[] = []
  const withoutImg: NewsItem[] = []
  for (const item of candidates) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (item.imageUrl) withImg.push(item)
    else withoutImg.push(item)
  }
  // Resimli haberler önce, resimsiz sonra
  return [...withImg, ...withoutImg].slice(0, limit)
}

function bucketLatest(pool: NewsItem[], limit: number, now: number): NewsItem[] {
  const fresh = pool.filter((item) => !isBreakingPoolItem(item))
  return rankFeedHotAware(fresh, now).slice(0, limit)
}

function bucketTrending(pool: NewsItem[], limit: number, now: number): NewsItem[] {
  return pickTrending(pool, limit, undefined, now)
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

export async function getHomeFeedInitialData(): Promise<HomeFeedInitialData> {
  const pool = await getHomeNewsPool(150)

  if (pool.length === 0) {
    return {
      breaking: [],
      featured: [],
      latest: [],
      trending: [],
      trendFeed: [],
      mostRead: [],
      categoryRails: {},
    }
  }

  const now = Date.now()

  return {
    breaking: bucketBreaking(pool, 12),
    featured: bucketFeatured(pool, 20),
    latest: bucketLatest(pool, 28, now),
    trending: bucketTrending(pool, 6, now),
    trendFeed: bucketTrending(pool, 24, now),
    mostRead: bucketMostRead(pool, 6),
    categoryRails: bucketCategoryRails(pool, 10),
  }
}

const getHomeCategoryItemsCached = unstable_cache(
  async (category: string, limitCount: number) => {
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
  },
  ['home-category-items-v1'],
  { revalidate: 300, tags: ['home-feed'] }
)

export async function getHomeCategoryItems(category: string, limitCount = 10): Promise<NewsItem[]> {
  return getHomeCategoryItemsCached(category, limitCount)
}

const getHomeLocalNewsCached = unstable_cache(
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
      return mapAdminDocs(snap.docs)
    } catch (error) {
      console.warn('[newsService.server] getHomeLocalNews failed:', error)
      return []
    }
  },
  ['home-local-news-v1'],
  { revalidate: 600, tags: ['local-news'] }
)

export async function getHomeLocalNews(citySlug: string, limitCount = 8): Promise<NewsItem[]> {
  const normalized = citySlug.trim().toLowerCase()
  if (!normalized) return []
  return getHomeLocalNewsCached(normalized, limitCount)
}
