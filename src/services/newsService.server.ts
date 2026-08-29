import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { docToNewsItem, slimNewsItemForFeed, slimNewsItemsForFeed } from '@/lib/newsItemUtils'
import { isNationalBreakingEligible, isNationalFeaturedEligible } from '@/lib/featuredScope'
import {
  isExcludedFromCityLocalPrimaryFeed,
  isExcludedFromHomepageMainSlots,
} from '@/lib/gastronomyRouting'
import { getHomeFeedCategoryFamily, isYerelHomepageExcluded } from '@/constants/config'
import { pickTrending, pickTrendFeed, rankFeedHotAware } from '@/lib/feedRanking'
import {
  addTurkeyDays,
  isTurkeyYmd,
  turkeyDayBounds,
} from '@/lib/turkeyCalendar'
import type { Post } from '@/types/post'
import { tagLookupVariants } from '@/lib/tags'
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
    const family = getHomeFeedCategoryFamily(categoryId)
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
      .map((doc) => {
        const data = doc.data() as NewsDocument
        if (
          !isNationalBreakingEligible({
            categoryId: data.categoryId,
            category: data.category,
            originalCategoryId: data.originalCategoryId,
          })
        ) {
          return null
        }
        return mapSliderItem(doc.id, data)
      })
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
      .map((doc) => {
        const data = doc.data() as NewsDocument
        if (
          !isNationalBreakingEligible({
            categoryId: data.categoryId,
            category: data.category,
            originalCategoryId: data.originalCategoryId,
          })
        ) {
          return null
        }
        return mapSliderItem(doc.id, data)
      })
      .filter((item): item is FeedSliderItem => item !== null)
  } catch (error) {
    console.warn('[newsService.server] son-dakika slider query failed:', error)
    return []
  }
}

const getBreakingSliderCached = unstable_cache(
  (scanLimit: number) => fetchBreakingSliderRaw(scanLimit),
  ['breaking-slider-v2'],
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

/**
 * Fuzzy slug fallback: when exact slug match fails, strip all hyphens and
 * compare against a prefix-scoped set of candidates.  This handles the common
 * case where apostrophe handling produces "tlye" in the DB but "tl-ye" in an
 * inbound link (or vice-versa).  The page handler already 301-redirects to
 * the canonical slug when `post.slug !== requestedSlug`.
 */
async function findByNormalizedSlug(slug: string): Promise<Post | null> {
  const norm = slug.replace(/-/g, '')
  const prefixLen = Math.min(20, Math.floor(slug.length * 0.4))
  if (prefixLen < 6) return null
  const prefix = slug.slice(0, prefixLen)

  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('slug', '>=', prefix)
      .where('slug', '<=', prefix + '\uf8ff')
      .limit(10)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data() as NewsDocument
      if ((data.slug || '').replace(/-/g, '') === norm) {
        return newsDocToPost(doc.id, data)
      }
    }
  } catch (error) {
    console.warn('[newsService.server] findByNormalizedSlug failed:', error)
  }
  return null
}

const getNewsBySlugCached = unstable_cache(
  async (slug: string): Promise<Post | null> => {
    try {
      const snap = await getAdminFirestore()
        .collection(NEWS_COLLECTION)
        .where('slug', '==', slug)
        .limit(1)
        .get()

      if (!snap.empty) {
        const doc = snap.docs[0]!
        return newsDocToPost(doc.id, doc.data() as NewsDocument)
      }
    } catch (error) {
      console.warn('[newsService.server] getNewsBySlug query failed:', error)
    }

    const byId = await getNewsById(slug)
    if (byId) return byId

    return findByNormalizedSlug(slug)
  },
  ['news-by-slug-v3'],
  { revalidate: 300, tags: ['news-post'] }
)

export async function getNewsBySlug(slug: string): Promise<Post | null> {
  const normalized = slug.trim()
  if (!normalized) return null

  let decoded = normalized
  try {
    decoded = decodeURIComponent(normalized).trim()
  } catch {}

  const post = await getNewsBySlugCached(decoded)
  if (!post && decoded !== normalized) {
    return getNewsBySlugCached(normalized)
  }
  return post
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
  ['home-news-pool-v5'],
  { revalidate: 300, tags: ['home-feed'] }
)

async function getHomeNewsPool(poolSize = 40): Promise<NewsItem[]> {
  return getHomeNewsPoolCached(poolSize)
}

function isHomepageEligibleItem(item: NewsItem): boolean {
  const cat = item.category?.trim() ?? ''
  if (cat && isYerelHomepageExcluded(cat)) return false
  // Gastronomi never fills güncel / latest / breaking / trending main slots
  if (isExcludedFromHomepageMainSlots(cat)) return false
  return true
}

function isBreakingPoolItem(item: NewsItem): boolean {
  if (item.articleFormat === 'column' || item.articleFormat === 'analysis') return false
  return item.breaking === true || item.category === 'son-dakika'
}

function bucketBreaking(pool: NewsItem[], limit: number): NewsItem[] {
  return pool
    .filter(
      (item) =>
        isHomepageEligibleItem(item) &&
        isBreakingPoolItem(item) &&
        isNationalBreakingEligible({
          category: item.category,
          originalCategoryId: item.originalCategoryId,
        })
    )
    .slice(0, limit)
}

/** CMS pin time first; missing featuredAt falls back to publish time (legacy RSS pins). */
function compareFeaturedPriority(a: NewsItem, b: NewsItem): number {
  const aPub = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
  const bPub = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
  const aPin = Date.parse(a.featuredAt ?? '') || aPub
  const bPin = Date.parse(b.featuredAt ?? '') || bPub
  if (aPin !== bPin) return bPin - aPin
  return bPub - aPub
}

/**
 * CMS “Öne Çıkan” — kategori bağımsız, yalnızca `featured === true`.
 * Yerel kategori ağacı pinleri ulusal ana sayfaya girmez (şehir sayfasına gider).
 * Kıbrıs/KKTC kategori ağacı pinleri yalnızca Kıbrıs sayfalarında görünür.
 * citySlug tek başına dışlamaz — Gündem/Son Dakika + şehir ulusal kalır.
 * Gündem filler yok; haber kendi kategori rayında ayrıca kalır.
 */
function bucketFeatured(pool: NewsItem[], limit: number, pinned: NewsItem[] = []): NewsItem[] {
  const isNationalPin = (p: NewsItem) =>
    p.featured === true &&
    isNationalFeaturedEligible({ category: p.category })
  const featuredPinned = pinned.filter(isNationalPin)
  const featuredPool = pool.filter(isNationalPin)
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
  // Moderate scan: first query already uses featuredAt index for recently-pinned articles.
  // Second (publishedAt) fallback only needs to cover recent publishes, not all history.
  const scan = Math.max(limit * 5, 60)

  const byId = new Map<string, NewsItem>()

  const mergeDocs = (docs: QueryDocumentSnapshot[]) => {
    for (const item of mapAdminDocs(docs)) {
      if (!item.featured) continue
      // Yerel-category featured pins belong on city homepages, not nahaber.com.
      if (!isNationalFeaturedEligible({ category: item.category })) {
        continue
      }
      byId.set(item.id, item)
    }
  }

  // Prefer pin time when indexed (status + featured + featuredAt).
  // Docs missing featuredAt are omitted by this query — merge a second scan.
  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('featured', '==', true)
      .orderBy('featuredAt', 'desc')
      .limit(scan)
      .get()
    mergeDocs(snap.docs)
  } catch (error) {
    console.warn('[newsService.server] featuredAt order failed, using publishedAt scan:', error)
  }

  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('featured', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(scan)
      .get()
    mergeDocs(snap.docs)
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
      mergeDocs(snap.docs)
    } catch (err2) {
      console.warn('[newsService.server] isEditorPick featured query failed:', err2)
    }
  }

  return [...byId.values()].sort(compareFeaturedPriority).slice(0, limit)
}

const getFeaturedNewsCached = unstable_cache(
  async (limit: number) => fetchFeaturedNews(limit),
  ['home-featured-v12'],
  { revalidate: 600, tags: ['home-feed'] }
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
      .filter((item) => item.category && family.has(item.category) && isHomepageEligibleItem(item))
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
  // Pool + dedicated featured query + all-time most-read (separate viewsCount query)
  const [pool, featuredPinned, mostReadDb] = await Promise.all([
    getHomeNewsPool(40),
    getFeaturedNewsCached(HOME_FEATURED_LIMIT),
    getMostReadPostsCached(8),
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
  const homePool = pool.filter(isHomepageEligibleItem)
  // Kategori rayları featured’ı dışlamaz — haber hem Öne Çıkan’da hem kendi kategorisinde.
  const categoryRails = await fillCategoryRails(homePool, HOME_FEED_SSR_RAILS, HOME_CATEGORY_RAIL_FETCH)

  const slimRails: HomeFeedInitialData['categoryRails'] = {}
  for (const [key, items] of Object.entries(categoryRails)) {
    slimRails[key as HomeCategorySlug] = slimNewsItemsForFeed(items ?? [])
  }

  // Prefer DB-level viewsCount sort (all published articles); fall back to pool-based sort
  const mostReadItems = mostReadDb.length > 0
    ? mostReadDb.slice(0, 6)
    : bucketMostRead(homePool, 6)

  return {
    breaking: slimNewsItemsForFeed(bucketBreaking(homePool, 8)),
    featured: slimNewsItemsForFeed(bucketFeatured(pool, HOME_FEATURED_LIMIT, featuredPinned)),
    latest: slimNewsItemsForFeed(bucketLatest(homePool, 16, now)),
    trending: slimNewsItemsForFeed(bucketTrending(homePool, 6, now)),
    trendFeed: slimNewsItemsForFeed(bucketTrendFeed(homePool, 12, now)),
    mostRead: slimNewsItemsForFeed(mostReadItems),
    categoryRails: slimRails,
  }
}

/** Pool-only rails for lazy client sections (same cache as home pool). */
export async function getHomeCategoryRailsLazy(
  categories?: HomeCategorySlug[]
): Promise<Partial<Record<HomeCategorySlug, NewsItem[]>>> {
  const pool = (await getHomeNewsPool(40)).filter(isHomepageEligibleItem)
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
        .limit(Math.min(limitCount * 3, 40))
        .get()
      return mapAdminDocs(snap.docs)
        .filter((item) => !isExcludedFromCityLocalPrimaryFeed(item.category))
        .slice(0, limitCount)
    } catch (error) {
      console.warn('[newsService.server] getHomeLocalNews failed:', error)
      return []
    }
  },
  ['home-local-news-v2'],
  { revalidate: 600, tags: ['local-news'] }
)

export async function getHomeLocalNews(citySlug: string, limitCount = 8): Promise<NewsItem[]> {
  const normalized = citySlug.trim().toLowerCase()
  if (!normalized) return []
  return getHomeLocalNewsCached(normalized, limitCount)
}

export interface HomeFeedMoreResult {
  items: NewsItem[]
  /** Turkey YMD that was loaded (null if empty after skip window). */
  day: string | null
  /** Next `beforeDay` the client should request. */
  prevDay: string | null
  hasMore: boolean
}

const DAY_FEED_MAX_ITEMS = 300
const EMPTY_DAY_SKIP_MAX = 7

async function hasPublishedBefore(beforeMs: number, categoryId?: string): Promise<boolean> {
  try {
    const db = getAdminFirestore()
    let q = db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('publishedAt', '<', beforeMs)
      .orderBy('publishedAt', 'desc')
      .limit(1)

    if (categoryId) {
      const family = getHomeFeedCategoryFamily(categoryId)
      q = db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where(
          'categoryId',
          family.length > 1 ? 'in' : '==',
          family.length > 1 ? family : categoryId
        )
        .where('publishedAt', '<', beforeMs)
        .orderBy('publishedAt', 'desc')
        .limit(1)
    }

    const snap = await q.get()
    return !snap.empty
  } catch (error) {
    console.warn('[newsService.server] hasPublishedBefore failed:', error)
    return false
  }
}

async function fetchPublishedInDay(
  ymd: string,
  categoryId?: string
): Promise<NewsItem[]> {
  const { startMs, endMs } = turkeyDayBounds(ymd)
  const db = getAdminFirestore()

  let q = db
    .collection(NEWS_COLLECTION)
    .where('status', '==', 'published')
    .where('publishedAt', '>=', startMs)
    .where('publishedAt', '<', endMs)
    .orderBy('publishedAt', 'desc')
    .limit(DAY_FEED_MAX_ITEMS)

  if (categoryId === 'son-dakika') {
    q = db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('isBreaking', '==', true)
      .where('publishedAt', '>=', startMs)
      .where('publishedAt', '<', endMs)
      .orderBy('publishedAt', 'desc')
      .limit(DAY_FEED_MAX_ITEMS)
    const snap = await q.get()
    return mapAdminDocs(snap.docs)
      .filter((item) =>
        isNationalBreakingEligible({
          category: item.category,
          originalCategoryId: item.originalCategoryId,
        })
      )
      .map(slimNewsItemForFeed)
  }

  if (categoryId) {
    const family = getHomeFeedCategoryFamily(categoryId)
    q = db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where(
        'categoryId',
        family.length > 1 ? 'in' : '==',
        family.length > 1 ? family : categoryId
      )
      .where('publishedAt', '>=', startMs)
      .where('publishedAt', '<', endMs)
      .orderBy('publishedAt', 'desc')
      .limit(DAY_FEED_MAX_ITEMS)
  }

  const snap = await q.get()
  return mapAdminDocs(snap.docs).map(slimNewsItemForFeed)
}

/**
 * Load one Turkey calendar day of published news (home or category).
 * Empty days are skipped up to EMPTY_DAY_SKIP_MAX.
 */
export async function getFeedByTurkeyDay(
  beforeDay: string,
  categoryId?: string
): Promise<HomeFeedMoreResult> {
  if (!isTurkeyYmd(beforeDay)) {
    return { items: [], day: null, prevDay: null, hasMore: false }
  }

  try {
    let ymd = beforeDay
    for (let i = 0; i < EMPTY_DAY_SKIP_MAX; i++) {
      const items = await fetchPublishedInDay(ymd, categoryId)
      if (items.length > 0) {
        const { startMs } = turkeyDayBounds(ymd)
        const hasMore = await hasPublishedBefore(startMs, categoryId)
        return {
          items,
          day: ymd,
          prevDay: addTurkeyDays(ymd, -1),
          hasMore,
        }
      }
      ymd = addTurkeyDays(ymd, -1)
    }

    const { startMs } = turkeyDayBounds(ymd)
    const hasMore = await hasPublishedBefore(startMs, categoryId)
    return {
      items: [],
      day: null,
      prevDay: hasMore ? ymd : null,
      hasMore,
    }
  } catch (error) {
    console.warn('[newsService.server] getFeedByTurkeyDay failed:', error)
    return { items: [], day: null, prevDay: null, hasMore: false }
  }
}

const getHomeFeedMoreCached = unstable_cache(
  (beforeDay: string) => getFeedByTurkeyDay(beforeDay),
  ['home-feed-more-v1'],
  { revalidate: 300, tags: ['home-feed'] }
)

/** @deprecated Prefer getFeedByTurkeyDay — kept name for call-site clarity on home. */
export async function getHomeFeedMore(beforeDay: string): Promise<HomeFeedMoreResult> {
  return getHomeFeedMoreCached(beforeDay)
}

/** Archive items published on the same calendar day (any year). Cached 1 hour per (month, day). */
const getOnThisDayNewsCached = unstable_cache(
  async (month: number, day: number): Promise<NewsItem[]> => {
    try {
      const db = getAdminFirestore()
      // Only show articles from PREVIOUS years — exclude current year
      const startOfCurrentYear = new Date(new Date().getFullYear(), 0, 1).getTime()

      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('publishedAt', '<', startOfCurrentYear)
        .orderBy('publishedAt', 'desc')
        .limit(300)
        .get()

      return mapAdminDocs(snap.docs).filter((item) => {
        const ts = item.publishedAt ?? item.createdAt
        if (!ts) return false
        const d = new Date(ts)
        return d.getMonth() + 1 === month && d.getDate() === day
      })
    } catch (error) {
      console.warn('[newsService.server] getOnThisDayNews failed:', error)
      return []
    }
  },
  ['on-this-day-v1'],
  { revalidate: 3600, tags: ['on-this-day'] }
)

export async function getOnThisDayNews(
  month: number,
  day: number,
  limitCount = 5
): Promise<NewsItem[]> {
  const items = await getOnThisDayNewsCached(month, day)
  return items.slice(0, limitCount)
}

function normalizeSuggestedTag(tag: string): string {
  return tag.replace(/^#+/, '').trim().toLocaleLowerCase('tr-TR')
}

/** Prefer same category, then overlapping tags (city tenants). */
function rankSuggestedPosts(
  posts: Post[],
  options: { categoryId?: string | null; tags?: string[] }
): Post[] {
  const categoryId = options.categoryId?.trim()
  const refTags = new Set(
    (options.tags ?? []).map(normalizeSuggestedTag).filter(Boolean)
  )

  if (!categoryId && refTags.size === 0) return posts

  return [...posts].sort((a, b) => {
    const aCat = categoryId && a.categoryId === categoryId ? 1 : 0
    const bCat = categoryId && b.categoryId === categoryId ? 1 : 0
    if (aCat !== bCat) return bCat - aCat

    if (refTags.size > 0) {
      const aTagScore = (a.tags ?? []).filter((t) => refTags.has(normalizeSuggestedTag(t))).length
      const bTagScore = (b.tags ?? []).filter((t) => refTags.has(normalizeSuggestedTag(t))).length
      if (aTagScore !== bTagScore) return bTagScore - aTagScore
    }

    return 0
  })
}

/** Published posts in the same category for crawlable internal links. Cached 10 min per category. */
const getSuggestedPostsCached = unstable_cache(
  async (categoryId: string | null, citySlug: string | null, fetchLimit: number): Promise<Post[]> => {
    try {
      const db = getAdminFirestore()
      let q = db.collection(NEWS_COLLECTION).where('status', '==', 'published')

      if (citySlug) {
        const snap = await q
          .where('citySlug', '==', citySlug)
          .orderBy('publishedAt', 'desc')
          .limit(fetchLimit)
          .get()
        return snap.docs
          .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
          .filter((post): post is Post => post !== null)
      }

      const snap = categoryId
        ? await q
            .where('categoryId', '==', categoryId)
            .orderBy('publishedAt', 'desc')
            .limit(fetchLimit)
            .get()
        : await q.orderBy('publishedAt', 'desc').limit(fetchLimit).get()

      return snap.docs
        .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
        .filter((post): post is Post => post !== null)
    } catch (error) {
      console.warn('[newsService.server] getSuggestedPostsServer failed:', error)
      return []
    }
  },
  ['suggested-posts-v2'],
  { revalidate: 600, tags: ['news-post'] }
)

export async function getSuggestedPostsServer(
  excludeId: string,
  options?: { categoryId?: string; limit?: number; citySlug?: string; tags?: string[] }
): Promise<Post[]> {
  const limitCount = options?.limit ?? 4
  const categoryId = options?.categoryId?.trim() || null
  const citySlug = options?.citySlug?.trim().toLowerCase() || null
  const fetchLimit = citySlug ? Math.max(limitCount + 20, 30) : limitCount + 5
  const posts = await getSuggestedPostsCached(categoryId, citySlug, fetchLimit)
  const ranked = citySlug
    ? rankSuggestedPosts(posts, { categoryId, tags: options?.tags })
    : posts
  return ranked.filter((post) => post.id !== excludeId).slice(0, limitCount)
}


/** Published posts matching a tag slug (indexable /etiket/[slug] pages). Cached 10 min per tag. */
const getPostsByTagCached = unstable_cache(
  async (rawTag: string, limitCount: number): Promise<Post[]> => {
    const variants = tagLookupVariants(rawTag)
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
  },
  ['posts-by-tag-v1'],
  { revalidate: 600, tags: ['news-post'] }
)

export async function getPostsByTag(rawTag: string, limitCount = 40): Promise<Post[]> {
  return getPostsByTagCached(rawTag, limitCount)
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

/** Public author profile resolved by username (Admin SDK). Cached 1 hour per username. */
const getAuthorByUsernameCached = unstable_cache(
  async (username: string): Promise<PublicAuthorProfile | null> => {
    try {
      const db = getAdminFirestore()
      const snap = await db
        .collection(Collections.USERS)
        .where('username', '==', username)
        .limit(1)
        .get()

      if (snap.empty) return null
      const doc = snap.docs[0]!
      const data = doc.data()
      if (data.isBlocked === true) return null

      return {
        uid: doc.id,
        username: String(data.username ?? username),
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
  },
  ['author-by-username-v1'],
  { revalidate: 3600, tags: ['author'] }
)

export async function getAuthorByUsername(username: string): Promise<PublicAuthorProfile | null> {
  const normalized = username.trim().toLocaleLowerCase('tr-TR')
  if (!normalized) return null
  return getAuthorByUsernameCached(normalized)
}

/** Published news authored by a user id (for /yazar/[username]). Cached 30 min per author. */
const getPostsByAuthorIdCached = unstable_cache(
  async (authorId: string, limitCount: number): Promise<Post[]> => {
    try {
      const db = getAdminFirestore()
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('authorId', '==', authorId)
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
          .filter((post): post is Post => post !== null && post.authorId === authorId)
          .slice(0, limitCount)
      } catch (fallbackError) {
        console.warn('[newsService.server] getPostsByAuthorId fallback failed:', fallbackError)
        return []
      }
    }
  },
  ['posts-by-author-v1'],
  { revalidate: 1800, tags: ['author'] }
)

export async function getPostsByAuthorId(authorId: string, limitCount = 40): Promise<Post[]> {
  const id = authorId.trim()
  if (!id) return []
  return getPostsByAuthorIdCached(id, limitCount)
}

// ─── Category feed by Turkey calendar day ─────────────────────────────────────

export interface CategoryFeedPage {
  items: NewsItem[]
  day: string | null
  prevDay: string | null
  hasMore: boolean
}

async function fetchCategoryFeedByDay(
  categoryId: string,
  beforeDay: string
): Promise<CategoryFeedPage> {
  return getFeedByTurkeyDay(beforeDay, categoryId)
}

export const getCategoryFeedPage = unstable_cache(
  (categoryId: string, beforeDay: string) => fetchCategoryFeedByDay(categoryId, beforeDay),
  ['category-feed-day-v2'],
  { revalidate: 300, tags: ['category-feed'] }
)

/**
 * Son 24 saatte yayınlanan makaleleri viewsCount'a göre sıralar.
 * publishedAt >= 24h önce filtresi + bellekte viewsCount desc sort (composite index gerekmez).
 * Fallback: all-time viewsCount desc (24h'de yeterli makale yoksa).
 */
const getMostReadPostsCached = unstable_cache(
  async (limitCount: number): Promise<NewsItem[]> => {
    try {
      const db = getAdminFirestore()
      const since24h = Date.now() - 24 * 60 * 60 * 1000

      // Son 24h makaleleri publishedAt'e göre çek; viewsCount'u bellekte sırala
      const snap24h = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('publishedAt', '>=', since24h)
        .orderBy('publishedAt', 'desc')
        .limit(200)
        .get()

      if (!snap24h.empty) {
        const items24h = mapAdminDocs(snap24h.docs)
        items24h.sort((a, b) => (b.viewsCount ?? b.views ?? 0) - (a.viewsCount ?? a.views ?? 0))
        if (items24h.length > 0) return items24h.slice(0, limitCount)
      }

      // Fallback: tüm zamanların en çok okunanları (24h'de yeterli haber yoksa)
      const snapAll = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .orderBy('viewsCount', 'desc')
        .limit(limitCount)
        .get()
      const itemsAll = mapAdminDocs(snapAll.docs)
      if (itemsAll.length > 0) return itemsAll
    } catch (error) {
      console.warn('[newsService.server] getMostReadPosts query failed:', error)
    }
    return []
  },
  ['most-read-24h-v2'],
  { revalidate: 300, tags: ['news-post'] }
)

export async function getMostReadPosts(limitCount = 40): Promise<NewsItem[]> {
  const items = await getMostReadPostsCached(limitCount)
  if (items.length > 0) return items
  // Fallback: pool-based sort (avoids circular dependency with getHomeFeedInitialData)
  const pool = await getHomeNewsPool(40)
  return bucketMostRead(pool.filter(isHomepageEligibleItem), limitCount)
}
