import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { docToNewsItem, slimNewsItemForFeed, slimNewsItemsForFeed } from '@/lib/newsItemUtils'
import { getCategoryFamily, getHomeFeedCategoryFamily } from '@/constants/config'
import { pickTrending, pickTrendFeed, rankFeedHotAware } from '@/lib/feedRanking'
import type { Post } from '@/types/post'
import type { FeedSliderItem } from '@/types/feedSlider'
import {
  HOME_CATEGORY_RAILS,
  HOME_CATEGORY_RAIL_FETCH,
  HOME_CATEGORY_RAIL_GUNDEM_FETCH,
  HOME_CATEGORY_DESKTOP_CARDS,
  HOME_FEED_SSR_RAILS,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'

export type { FeedSliderItem }
export { HOME_FEATURED_LIMIT }

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
    .map((doc) => docToNewsItem(doc.id, doc.data() as Record<string, unknown>, { mode: 'list' }))
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
  ['home-news-pool-v4'],
  { revalidate: 120, tags: ['home-feed'] }
)

async function getHomeNewsPool(poolSize = 120): Promise<NewsItem[]> {
  return getHomeNewsPoolCached(poolSize)
}

function isBreakingPoolItem(item: NewsItem): boolean {
  if (item.articleFormat === 'column' || item.articleFormat === 'analysis') return false
  return item.breaking === true || item.category === 'son-dakika'
}

function bucketBreaking(pool: NewsItem[], limit: number): NewsItem[] {
  return pool.filter(isBreakingPoolItem).slice(0, limit)
}

/** CMS pin time first, then publish time — newly toggled “Öne Çıkan” rises above older flags. */
function compareFeaturedPriority(a: NewsItem, b: NewsItem): number {
  const aPin = Date.parse(a.featuredAt ?? '') || 0
  const bPin = Date.parse(b.featuredAt ?? '') || 0
  if (aPin !== bPin) return bPin - aPin
  const aPub = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
  const bPub = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
  return bPub - aPub
}

/**
 * CMS “Öne Çıkan” — kategori bağımsız, yalnızca `featured === true`.
 * Gündem filler yok; haber kendi kategori rayında ayrıca kalır.
 */
function bucketFeatured(pool: NewsItem[], limit: number, pinned: NewsItem[] = []): NewsItem[] {
  const featuredPinned = pinned.filter((p) => p.featured === true)
  const featuredPool = pool.filter((p) => p.featured === true)
  const candidates = [...featuredPinned, ...featuredPool].sort(compareFeaturedPriority)
  const seen = new Set<string>()
  const ordered: NewsItem[] = []
  for (const item of candidates) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    ordered.push(item)
    if (ordered.length >= limit) break
  }
  return ordered
}

async function fetchFeaturedNews(limit: number): Promise<NewsItem[]> {
  const db = getAdminFirestore()
  // Fetch a wider window then re-rank by featuredAt (CMS toggle) so older
  // publish dates don't bury newly pinned Öne Çıkan items.
  const scan = Math.max(limit * 4, 24)
  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('featured', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(scan)
      .get()
    return mapAdminDocs(snap.docs).sort(compareFeaturedPriority).slice(0, limit)
  } catch (error) {
    console.warn('[newsService.server] featured query failed, trying isEditorPick:', error)
    try {
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('isEditorPick', '==', true)
        .orderBy('publishedAt', 'desc')
        .limit(scan)
        .get()
      return mapAdminDocs(snap.docs).sort(compareFeaturedPriority).slice(0, limit)
    } catch (err2) {
      console.warn('[newsService.server] isEditorPick featured query failed:', err2)
      return []
    }
  }
}

const getFeaturedNewsCached = unstable_cache(
  async (limit: number) => fetchFeaturedNews(limit),
  ['home-featured-v3'],
  { revalidate: 30, tags: ['home-feed'] }
)

function bucketLatest(pool: NewsItem[], limit: number, now: number): NewsItem[] {
  const fresh = pool.filter((item) => !isBreakingPoolItem(item))
  return rankFeedHotAware(fresh, now).slice(0, limit)
}

function bucketTrending(pool: NewsItem[], limit: number, now: number): NewsItem[] {
  // 1) Gerçek trend haberleri: görüntülenme/etkileşim skoruna göre
  const trending = pickTrending(pool, limit, undefined, now)

  if (trending.length >= limit) return trending

  // 2) Etkileşim verisi yetersizse (yeni site) — daha düşük eşikle dene
  const relaxed = pickTrending(pool, limit, {
    minEngagement: 1,
    requireImage: true,
    excludeBreaking: true,
    maxAgeHours: 72,
  }, now)

  const seen = new Set(trending.map((i) => i.id))
  const merged = [...trending]
  for (const item of relaxed) {
    if (merged.length >= limit) break
    if (!seen.has(item.id)) { seen.add(item.id); merged.push(item) }
  }

  if (merged.length >= limit) return merged

  // 3) Hâlâ yetersizse gündem haberlerinden tamamla (en yeniden en eskiye)
  const gundemFallback = pool
    .filter((item) => item.category === 'gundem' && !!item.imageUrl && !seen.has(item.id))
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
      return tb - ta
    })

  for (const item of gundemFallback) {
    if (merged.length >= limit) break
    seen.add(item.id)
    merged.push(item)
  }

  return merged
}

function bucketTrendFeed(pool: NewsItem[], limit: number, now: number): NewsItem[] {
  return pickTrendFeed(pool, limit, now)
}

function bucketMostRead(pool: NewsItem[], limit: number): NewsItem[] {
  const withViews = pool.filter((p) => typeof p.views === 'number' && (p.views ?? 0) > 0)
  if (withViews.length === 0) return pool.slice(0, limit)
  return [...withViews]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, limit)
}

function bucketCategoryRails(
  pool: NewsItem[],
  perCategory = HOME_CATEGORY_RAIL_FETCH,
  categories: readonly HomeCategorySlug[] = HOME_CATEGORY_RAILS
): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const category of categories) {
    const family = new Set(getHomeFeedCategoryFamily(category))
    const limit = category === 'gundem' ? HOME_CATEGORY_RAIL_GUNDEM_FETCH : perCategory
    const items = pool
      .filter((item) => item.category && family.has(item.category))
      .slice(0, limit)
    if (items.length > 0) rails[category] = items
  }
  return rails
}

/**
 * Havuzda eksik kalan kategorileri ayrı sorguyla tamamla — her rayda eşit kart.
 */
async function fillCategoryRails(
  pool: NewsItem[],
  categories: readonly HomeCategorySlug[],
  perCategory = HOME_CATEGORY_RAIL_FETCH
): Promise<Partial<Record<HomeCategorySlug, NewsItem[]>>> {
  const rails = bucketCategoryRails(pool, perCategory, categories)
  const thin = categories.filter((c) => {
    const need = c === 'gundem' ? HOME_CATEGORY_RAIL_GUNDEM_FETCH : perCategory
    return (rails[c]?.length ?? 0) < need
  })

  if (thin.length === 0) return rails

  const filled = await Promise.all(
    thin.map(async (category) => {
      const need = category === 'gundem' ? HOME_CATEGORY_RAIL_GUNDEM_FETCH : perCategory
      const items = await getHomeFeedRailItems(category, need)
      return [category, items] as const
    })
  )

  for (const [category, items] of filled) {
    if (items.length > 0) rails[category] = items
  }
  return rails
}

const getHomeFeedRailItemsCached = unstable_cache(
  async (category: string, limitCount: number) => {
    try {
      const db = getAdminFirestore()
      const family = getHomeFeedCategoryFamily(category)
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
      console.warn('[newsService.server] getHomeFeedRailItems failed:', category, error)
      return []
    }
  },
  ['home-feed-rail-items-v1'],
  { revalidate: 300, tags: ['home-feed'] }
)

async function getHomeFeedRailItems(category: string, limitCount: number): Promise<NewsItem[]> {
  return getHomeFeedRailItemsCached(category, limitCount)
}

/**
 * Category rails are filled from the home news pool first; thin rails are
 * topped up with a per-category query (standalone alt kategoriler dahil).
 */

export async function getHomeFeedInitialData(): Promise<HomeFeedInitialData> {
  // Pool + dedicated featured query (CMS “Öne Çıkan” — kategori bağımsız ilk 10)
  const [pool, featuredPinned] = await Promise.all([
    getHomeNewsPool(160),
    getFeaturedNewsCached(HOME_FEATURED_LIMIT),
  ])

  if (pool.length === 0 && featuredPinned.length === 0) {
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
  // Kategori rayları featured’ı dışlamaz — haber hem Öne Çıkan’da hem kendi kategorisinde.
  const categoryRails = await fillCategoryRails(pool, HOME_FEED_SSR_RAILS, HOME_CATEGORY_RAIL_FETCH)

  const slimRails: HomeFeedInitialData['categoryRails'] = {}
  for (const [key, items] of Object.entries(categoryRails)) {
    slimRails[key as HomeCategorySlug] = slimNewsItemsForFeed(items ?? [])
  }

  return {
    breaking: slimNewsItemsForFeed(bucketBreaking(pool, 8)),
    featured: slimNewsItemsForFeed(bucketFeatured(pool, HOME_FEATURED_LIMIT, featuredPinned)),
    latest: slimNewsItemsForFeed(bucketLatest(pool, 16, now)),
    trending: slimNewsItemsForFeed(bucketTrending(pool, 6, now)),
    trendFeed: slimNewsItemsForFeed(bucketTrendFeed(pool, 12, now)),
    mostRead: slimNewsItemsForFeed(bucketMostRead(pool, 6)),
    categoryRails: slimRails,
  }
}

/** Pool-only rails for lazy client sections (same cache as home pool). */
export async function getHomeCategoryRailsLazy(
  categories?: HomeCategorySlug[]
): Promise<Partial<Record<HomeCategorySlug, NewsItem[]>>> {
  const pool = await getHomeNewsPool(160)
  if (pool.length === 0) return {}
  const wanted =
    categories && categories.length > 0
      ? categories.filter((c): c is HomeCategorySlug =>
          (HOME_CATEGORY_RAILS as readonly string[]).includes(c)
        )
      : HOME_CATEGORY_RAILS.filter((c) => !HOME_FEED_SSR_RAILS.includes(c))
  const rails = await fillCategoryRails(pool, wanted, HOME_CATEGORY_RAIL_FETCH)
  const slim: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const [key, items] of Object.entries(rails)) {
    slim[key as HomeCategorySlug] = slimNewsItemsForFeed(items ?? [])
  }
  return slim
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
  ['home-category-items-v2'],
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

export interface HomeFeedMoreResult {
  items: NewsItem[]
  nextCursor: string | null
  hasMore: boolean
}

/** Paginated home feed items for infinite scroll. */
export async function getHomeFeedMore(
  cursor?: string,
  limitCount = 8
): Promise<HomeFeedMoreResult> {
  try {
    const db = getAdminFirestore()
    let query = db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(limitCount + 1)

    if (cursor) {
      const cursorMs = Number(cursor)
      if (Number.isFinite(cursorMs)) {
        query = db
          .collection(NEWS_COLLECTION)
          .where('status', '==', 'published')
          .orderBy('publishedAt', 'desc')
          .startAfter(cursorMs)
          .limit(limitCount + 1)
      }
    }

    const snap = await query.get()
    const all = mapAdminDocs(snap.docs)
    const hasMore = all.length > limitCount
    const page = all.slice(0, limitCount)
    const last = page[page.length - 1]
    const nextCursor = hasMore && last
      ? String(Date.parse(last.publishedAt ?? last.createdAt ?? '') || '')
      : null

    return {
      items: page.map(slimNewsItemForFeed),
      nextCursor: nextCursor && nextCursor !== 'NaN' ? nextCursor : null,
      hasMore,
    }
  } catch (error) {
    console.warn('[newsService.server] getHomeFeedMore failed:', error)
    return { items: [], nextCursor: null, hasMore: false }
  }
}

/** Archive items published on the same calendar day (any year). */
export async function getOnThisDayNews(
  month: number,
  day: number,
  limitCount = 5
): Promise<NewsItem[]> {
  try {
    const db = getAdminFirestore()
    // Only show articles from PREVIOUS years — exclude current year
    const startOfCurrentYear = new Date(new Date().getFullYear(), 0, 1).getTime()

    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('publishedAt', '<', startOfCurrentYear)
      .orderBy('publishedAt', 'desc')
      .limit(1000)
      .get()

    const items = mapAdminDocs(snap.docs).filter((item) => {
      const ts = item.publishedAt ?? item.createdAt
      if (!ts) return false
      const d = new Date(ts)
      return d.getMonth() + 1 === month && d.getDate() === day
    })

    return items.slice(0, limitCount)
  } catch (error) {
    console.warn('[newsService.server] getOnThisDayNews failed:', error)
    return []
  }
}

/** Published posts in the same category for crawlable internal links. */
export async function getSuggestedPostsServer(
  excludeId: string,
  options?: { categoryId?: string; limit?: number }
): Promise<Post[]> {
  const limitCount = options?.limit ?? 4
  const categoryId = options?.categoryId?.trim()

  try {
    const db = getAdminFirestore()
    const base = db.collection(NEWS_COLLECTION).where('status', '==', 'published')

    const snap = categoryId
      ? await base
          .where('categoryId', '==', categoryId)
          .orderBy('publishedAt', 'desc')
          .limit(limitCount + 5)
          .get()
      : await base.orderBy('publishedAt', 'desc').limit(limitCount + 5).get()

    return snap.docs
      .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
      .filter((post): post is Post => post !== null && post.id !== excludeId)
      .slice(0, limitCount)
  } catch (error) {
    console.warn('[newsService.server] getSuggestedPostsServer failed:', error)
    return []
  }
}

function tagVariants(raw: string): string[] {
  const term = raw.trim()
  if (!term) return []
  const lower = term.toLocaleLowerCase('tr-TR')
  const variants = new Set<string>([lower, term])
  if (lower.length > 0) {
    variants.add(lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1))
  }
  return [...variants]
}

/** Published posts matching a tag slug (indexable /etiket/[slug] pages). */
export async function getPostsByTag(rawTag: string, limitCount = 40): Promise<Post[]> {
  const variants = tagVariants(rawTag)
  if (variants.length === 0) return []

  try {
    const db = getAdminFirestore()
    const seen = new Set<string>()
    const posts: Post[] = []

    await Promise.allSettled(
      variants.map(async (variant) => {
        const snap = await db
          .collection(NEWS_COLLECTION)
          .where('status', '==', 'published')
          .where('tags', 'array-contains', variant)
          .limit(limitCount)
          .get()

        for (const doc of snap.docs) {
          if (seen.has(doc.id)) continue
          const post = newsDocToPost(doc.id, doc.data() as NewsDocument)
          if (post) {
            seen.add(doc.id)
            posts.push(post)
          }
        }
      })
    )

    return posts.sort(
      (a, b) => Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt)
    )
  } catch (error) {
    console.warn('[newsService.server] getPostsByTag failed:', error)
    return []
  }
}

export type PublicAuthorProfile = {
  uid: string
  username: string
  displayName: string
  photoURL: string | null
  bio: string | null
  website: string | null
  location: string | null
  department?: string
  isVerified: boolean
  postsCount: number
  isAI?: boolean
  aiEditorId?: string | null
  coverURL?: string | null
}

/** Public author profile resolved by username (Admin SDK). */
export async function getAuthorByUsername(username: string): Promise<PublicAuthorProfile | null> {
  const normalized = username.trim().toLocaleLowerCase('tr-TR')
  if (!normalized) return null

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(Collections.USERS)
      .where('username', '==', normalized)
      .limit(1)
      .get()

    if (snap.empty) return null
    const doc = snap.docs[0]!
    const data = doc.data()
    if (data.isBlocked === true) return null

    return {
      uid: doc.id,
      username: String(data.username ?? normalized),
      displayName: String(data.displayName ?? data.username ?? 'Yazar'),
      photoURL: (data.photoURL as string | null | undefined) ?? null,
      bio: (data.bio as string | null | undefined) ?? null,
      website: (data.website as string | null | undefined) ?? null,
      location: (data.location as string | null | undefined) ?? null,
      department: data.department as string | undefined,
      isVerified: Boolean(data.isVerified),
      postsCount: typeof data.postsCount === 'number' ? data.postsCount : 0,
      isAI: data.isAI === true,
      aiEditorId: (data.aiEditorId as string | null | undefined) ?? null,
      coverURL: (data.coverURL as string | null | undefined) ?? null,
    }
  } catch (error) {
    console.warn('[newsService.server] getAuthorByUsername failed:', error)
    return null
  }
}

/** Published news authored by a user id (for /yazar/[username]). */
export async function getPostsByAuthorId(authorId: string, limitCount = 40): Promise<Post[]> {
  const id = authorId.trim()
  if (!id) return []

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('authorId', '==', id)
      .orderBy('publishedAt', 'desc')
      .limit(limitCount)
      .get()

    return snap.docs
      .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
      .filter((post): post is Post => post !== null)
  } catch (error) {
    // Fallback without composite index: filter in memory from recent published docs.
    console.warn('[newsService.server] getPostsByAuthorId indexed query failed, falling back:', error)
    try {
      const db = getAdminFirestore()
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(200)
        .get()

      return snap.docs
        .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
        .filter((post): post is Post => post !== null && post.authorId === id)
        .slice(0, limitCount)
    } catch (fallbackError) {
      console.warn('[newsService.server] getPostsByAuthorId fallback failed:', fallbackError)
      return []
    }
  }
}

/** All-time most-read published articles for the public /cok-okunanlar page. */
export async function getMostReadPosts(limitCount = 40): Promise<NewsItem[]> {
  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .orderBy('viewsCount', 'desc')
      .limit(limitCount)
      .get()

    const items = mapAdminDocs(snap.docs)
    if (items.length > 0) return items
  } catch (error) {
    console.warn('[newsService.server] getMostReadPosts viewsCount query failed:', error)
  }

  // Fallback: reuse the home pool's most-read bucket.
  const home = await getHomeFeedInitialData()
  return home.mostRead.slice(0, limitCount)
}
