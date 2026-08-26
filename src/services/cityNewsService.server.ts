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
import {
  HOME_CATEGORY_RAIL_FETCH,
  HOME_CATEGORY_RAIL_GUNDEM_FETCH,
  HOME_CATEGORY_RAILS,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
} from '@/types/newsItem'
import { getThemedCategorySectionIds } from '@/constants/categorySections'
import { getCategoryFamily, getNationalCategoryForYerelSubcategory } from '@/constants/config'
import { pickTrendFeed, pickTrending, rankFeedHotAware } from '@/lib/feedRanking'
import { isCityFeaturedPin, isLocalScopedNews, pickCityFeaturedCarouselItems } from '@/lib/featuredScope'
import { isExcludedFromCityLocalPrimaryFeed } from '@/lib/gastronomyRouting'
import { slimNewsItemsForFeed } from '@/lib/newsItemUtils'
import { isPostgresReadsEnabled } from '@/db'
import { DISTRICT_DISPLAY_NAMES } from '@/constants/cities'

interface NewsDocument {
  title?: string
  slug?: string
  description?: string
  summary?: string
  coverImageUrl?: string
  thumbnail?: string
  categoryId?: string
  category?: string
  originalCategoryId?: string
  status?: string
  publishedAt?: number | { _seconds?: number }
  citySlug?: string
  city?: string
  district?: string
  districtSlug?: string
  /** Legacy nested location; prefer top-level district fields when present. */
  location?: { district?: string } | null
  tags?: string[]
  views?: number
  likesCount?: number
  commentsCount?: number
  isBreaking?: boolean
  featured?: boolean
  featuredAt?: number | { _seconds?: number }
  localFeatured?: boolean
  localFeaturedAt?: number | { _seconds?: number }
  source?: string
  author?: string
  authorPhotoURL?: string
  articleFormat?: string
  seoTitle?: string
  videoUrl?: string
  readingMinutes?: number
  additionalImages?: { url?: string; caption?: string }[]
  galleryImages?: string[]
}

/** District slug/name tag variants for Firestore array-contains (biga, Biga, #Biga, …). */
function districtTagVariants(districtSlug: string): string[] {
  const slug = districtSlug.trim().toLowerCase()
  const variants = new Set<string>([slug])
  const displayName = DISTRICT_DISPLAY_NAMES[slug]
  if (displayName) {
    variants.add(displayName)
    const lower = displayName.toLocaleLowerCase('tr-TR')
    variants.add(lower)
    if (lower.length > 0) {
      variants.add(lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1))
    }
  }
  for (const value of [...variants]) {
    variants.add(`#${value}`)
  }
  return [...variants]
}

function normalizeDistrictTag(tag: string): string {
  return tag.replace(/^#+/, '').trim().toLocaleLowerCase('tr-TR')
}

/** True when a published doc belongs to the requested city district (tags, districtSlug, or district name). */
function newsDocMatchesDistrict(
  data: NewsDocument,
  citySlug: string,
  districtSlug: string
): boolean {
  const docCity = (data.citySlug || '').trim().toLowerCase()
  if (docCity && docCity !== citySlug) return false

  const docDistrictSlug = (data.districtSlug || '').trim().toLowerCase()
  if (docDistrictSlug === districtSlug) return true

  const displayName = (DISTRICT_DISPLAY_NAMES[districtSlug] || '').toLocaleLowerCase('tr-TR')
  const docDistrictName = (data.district || '').trim().toLocaleLowerCase('tr-TR')
  if (displayName && docDistrictName === displayName) return true

  const tagSet = new Set(
    (Array.isArray(data.tags) ? data.tags : []).map((tag) => normalizeDistrictTag(String(tag)))
  )
  return districtTagVariants(districtSlug).some((variant) => tagSet.has(normalizeDistrictTag(variant)))
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
    summary: data.summary?.trim() || undefined,
    imageUrl: data.coverImageUrl?.trim() || data.thumbnail?.trim() || undefined,
    videoUrl: data.videoUrl?.trim() || undefined,
    additionalImages: (() => {
      const imgs: { url: string; caption?: string }[] = []
      if (Array.isArray(data.additionalImages)) {
        for (const img of data.additionalImages) {
          const u = img?.url?.trim()
          if (u) imgs.push({ url: u, caption: img.caption?.trim() || undefined })
        }
      }
      if (Array.isArray(data.galleryImages)) {
        for (const u of data.galleryImages) {
          const s = typeof u === 'string' ? u.trim() : ''
          if (s) imgs.push({ url: s })
        }
      }
      return imgs.length ? imgs : undefined
    })(),
    category: data.categoryId?.trim() || data.category?.trim() || undefined,
    originalCategoryId: data.originalCategoryId?.trim() || undefined,
    source: data.source?.trim() || undefined,
    author: data.author?.trim() || undefined,
    authorPhotoURL: data.authorPhotoURL?.trim() || undefined,
    city: data.city?.trim() || undefined,
    citySlug: data.citySlug?.trim().toLowerCase() || undefined,
    district: data.district?.trim() || data.location?.district?.trim() || undefined,
    districtSlug: data.districtSlug?.trim().toLowerCase() || undefined,
    publishedAt,
    views: data.views,
    likesCount: data.likesCount,
    commentsCount: data.commentsCount,
    breaking: data.isBreaking,
    featured: data.featured === true,
    featuredAt:
      typeof data.featuredAt === 'number' && data.featuredAt > 0
        ? new Date(data.featuredAt).toISOString()
        : data.featuredAt && typeof (data.featuredAt as { _seconds?: number })._seconds === 'number'
          ? new Date((data.featuredAt as { _seconds: number })._seconds * 1000).toISOString()
          : undefined,
    localFeatured: data.localFeatured === true,
    localFeaturedAt:
      typeof data.localFeaturedAt === 'number' && data.localFeaturedAt > 0
        ? new Date(data.localFeaturedAt).toISOString()
        : data.localFeaturedAt && typeof (data.localFeaturedAt as { _seconds?: number })._seconds === 'number'
          ? new Date((data.localFeaturedAt as { _seconds: number })._seconds * 1000).toISOString()
          : undefined,
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
        districtName: schema.news.districtName,
        districtSlug: schema.news.districtSlug,
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

    return rows
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description ?? undefined,
        imageUrl: r.coverImageUrl ?? r.thumbnailUrl ?? undefined,
        videoUrl: r.videoUrl ?? undefined,
        category: r.categoryId ?? undefined,
        source: r.source ?? undefined,
        city: r.cityName ?? undefined,
        district: r.districtName ?? undefined,
        districtSlug: r.districtSlug ?? undefined,
        publishedAt: r.publishedAt?.toISOString(),
        views: r.viewsCount,
        likesCount: r.likesCount,
        commentsCount: r.commentsCount,
        breaking: r.isBreaking,
        articleFormat: r.articleFormat as NewsItem['articleFormat'],
        seoTitle: r.seoTitle ?? undefined,
      }))
      .filter((item) => !isExcludedFromCityLocalPrimaryFeed(item.category))
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
        .limit(Math.min(limitCount * 3, 120))
        .get()

      const items: NewsItem[] = []
      for (const doc of snap.docs) {
        const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
        if (item && !isExcludedFromCityLocalPrimaryFeed(item.category)) items.push(item)
        if (items.length >= limitCount) break
      }
      return items
    } catch (error) {
      console.warn('[cityNewsService] getCityNews failed:', error)
      return []
    }
  },
  ['city-news-feed-v4'],
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

/** Firestore `in` max; chunk full city category families (spor + yerel-spor mirrors). */
const FIRESTORE_IN_LIMIT = 10

function chunkIds(ids: string[], size = FIRESTORE_IN_LIMIT): string[][] {
  if (ids.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

function newsItemPublishedMs(item: NewsItem): number {
  return Date.parse(item.publishedAt ?? item.createdAt ?? '') || 0
}

/**
 * City category pages must use the uncapped family (getCategoryFamily), not
 * getHomeFeedCategoryFamily. The homepage helper truncates to 10 national ids
 * and drops yerel mirrors (yerel-spor, yerel-futbol, …) — which is intentional
 * for nahaber.com dual-route rails, but hides CMS “Yerel · Spor” city stories.
 */
const getCityNewsByCategoryCached = unstable_cache(
  async (citySlug: string, categoryId: string, limitCount: number) => {
    try {
      const db = getAdminFirestore()
      const family = getCategoryFamily(categoryId)
      const byId = new Map<string, NewsItem>()

      await Promise.all(
        chunkIds(family.length > 0 ? family : [categoryId]).map(async (chunk) => {
          let q = db
            .collection(NEWS_COLLECTION)
            .where('status', '==', 'published')
            .where('citySlug', '==', citySlug)

          q =
            chunk.length > 1
              ? q.where('categoryId', 'in', chunk)
              : q.where('categoryId', '==', chunk[0])

          const snap = await q.orderBy('publishedAt', 'desc').limit(limitCount).get()
          for (const doc of snap.docs) {
            if (byId.has(doc.id)) continue
            const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
            if (item) byId.set(doc.id, item)
          }
        })
      )

      return [...byId.values()]
        .sort((a, b) => newsItemPublishedMs(b) - newsItemPublishedMs(a))
        .slice(0, limitCount)
    } catch (error) {
      console.warn('[cityNewsService] getCityNewsByCategory failed:', error)
      return []
    }
  },
  ['city-news-category-v2'],
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
      const seen = new Set<string>()
      const items: NewsItem[] = []

      const addDoc = (id: string, data: NewsDocument) => {
        if (seen.has(id)) return
        if (!newsDocMatchesDistrict(data, citySlug, districtSlug)) return
        const item = docToNewsItem(id, data)
        if (!item) return
        seen.add(id)
        items.push(item)
      }

      // Primary: district slug/name in tags[] (geoEngine + manual tagging).
      const variants = districtTagVariants(districtSlug)
      await Promise.allSettled(
        variants.map(async (variant) => {
          const snap = await db
            .collection(NEWS_COLLECTION)
            .where('status', '==', 'published')
            .where('tags', 'array-contains', variant)
            .limit(limitCount * 3)
            .get()

          for (const doc of snap.docs) {
            addDoc(doc.id, doc.data() as NewsDocument)
          }
        })
      )

      // Secondary: scan recent city news for districtSlug / district / tags matches.
      if (items.length < limitCount) {
        const citySnap = await db
          .collection(NEWS_COLLECTION)
          .where('status', '==', 'published')
          .where('citySlug', '==', citySlug)
          .orderBy('publishedAt', 'desc')
          .limit(Math.max(limitCount * 5, 100))
          .get()

        for (const doc of citySnap.docs) {
          addDoc(doc.id, doc.data() as NewsDocument)
        }
      }

      items.sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
        return tb - ta
      })

      return items.slice(0, limitCount)
    } catch (error) {
      console.warn('[cityNewsService] getCityNewsByDistrict failed:', error)
      return []
    }
  },
  ['city-news-district-v3'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Fetch published news for a city + district, newest first.
 * Matches district via tags[], districtSlug, or district display name.
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

// ─── Dynamic city categories ────────────────────────────────────────────────

export interface CityCategory {
  id: string
  name: string
  slug: string
}

/** Categories with ≥1 city article + section presence flags (same pool, no N+1). */
export interface CityNavPresence {
  categories: CityCategory[]
  /** True when pool has spor / yerel-spor / spor subcategory news. */
  hasSpor: boolean
}

function poolHasSporNews(pool: NewsItem[]): boolean {
  if (pool.length === 0) return false
  // Uncapped family for presence — homepage 10-limit must not hide spor section.
  const family = new Set(getCategoryFamily('spor'))
  return pool.some((item) => {
    const cat = item.category?.trim()
    if (!cat) return false
    if (family.has(cat)) return true
    const national = getNationalCategoryForYerelSubcategory(cat)
    return Boolean(national && family.has(national))
  })
}

/** Map raw category ids to ordered CityCategory nav entries (chips first). */
async function mapCategoryIdSetToCityCategories(idSet: Set<string>): Promise<CityCategory[]> {
  const { DEFAULT_CATEGORIES } = await import('@/constants/config')
  const {
    CITY_CATEGORY_CHIPS,
    CITY_DYNAMIC_NAV_CHIP_IDS,
    CITY_DYNAMIC_NAV_EXCLUDED_IDS,
  } = await import('@/constants/cityCategories')

  const chipByCategoryId = new Map(
    CITY_CATEGORY_CHIPS
      .filter((chip) => chip.categoryId)
      .map((chip) => [chip.categoryId!, chip])
  )

  const results: CityCategory[] = []
  const seen = new Set<string>()

  for (const categoryId of CITY_DYNAMIC_NAV_CHIP_IDS) {
    if (!idSet.has(categoryId) || seen.has(categoryId)) continue
    const chip = chipByCategoryId.get(categoryId)
    results.push({
      id: categoryId,
      name: chip?.label ?? categoryId,
      slug: categoryId,
    })
    seen.add(categoryId)
  }

  for (const cat of DEFAULT_CATEGORIES) {
    if (cat.parentId || !idSet.has(cat.id)) continue
    if (CITY_DYNAMIC_NAV_EXCLUDED_IDS.has(cat.id) || seen.has(cat.id)) continue
    if (chipByCategoryId.has(cat.id)) continue
    results.push({ id: cat.id, name: cat.name, slug: cat.slug ?? cat.id })
    seen.add(cat.id)
  }

  return results
}

/**
 * Derive sidebar/nav categories from a city news pool — same family matching
 * as feed category rails so empty categories never appear in the menu.
 */
export async function deriveCityCategoriesFromPool(pool: NewsItem[]): Promise<CityCategory[]> {
  if (pool.length === 0) return []

  const { DEFAULT_CATEGORIES } = await import('@/constants/config')
  const { CITY_DYNAMIC_NAV_CHIP_IDS, CITY_DYNAMIC_NAV_EXCLUDED_IDS } = await import(
    '@/constants/cityCategories'
  )

  const idSet = new Set<string>()

  for (const categoryId of CITY_DYNAMIC_NAV_CHIP_IDS) {
    // Uncapped family — same as city category feeds (yerel-spor must light Spor).
    const family = new Set(getCategoryFamily(categoryId))
    if (pool.some((item) => item.category && family.has(item.category))) {
      idSet.add(categoryId)
    }
  }

  for (const item of pool) {
    const catId = item.category?.trim()
    if (!catId) continue

    const yerelNational = getNationalCategoryForYerelSubcategory(catId)
    if (yerelNational) {
      idSet.add(yerelNational)
      continue
    }

    // Yerel-only alt kategori (ör. yerel-duyuru) — chip id doğrudan ekle
    if ((CITY_DYNAMIC_NAV_CHIP_IDS as readonly string[]).includes(catId)) {
      idSet.add(catId)
      continue
    }

    const def = DEFAULT_CATEGORIES.find((c) => c.id === catId)
    if (def?.parentId) {
      idSet.add(def.parentId)
    } else if (
      def &&
      !def.parentId &&
      !CITY_DYNAMIC_NAV_EXCLUDED_IDS.has(catId) &&
      !CITY_DYNAMIC_NAV_CHIP_IDS.includes(catId)
    ) {
      idSet.add(catId)
    }
  }

  return mapCategoryIdSetToCityCategories(idSet)
}

/** Categories + Spor section presence from one city news pool. */
export async function deriveCityNavPresenceFromPool(pool: NewsItem[]): Promise<CityNavPresence> {
  const categories = await deriveCityCategoriesFromPool(pool)
  return { categories, hasSpor: poolHasSporNews(pool) }
}

const CITY_CATEGORY_POOL_LIMIT = 500

const getCityNavPresenceCached = unstable_cache(
  async (citySlug: string): Promise<CityNavPresence> => {
    const pool = await getCityNews(citySlug, CITY_CATEGORY_POOL_LIMIT)
    return deriveCityNavPresenceFromPool(pool)
  },
  ['city-nav-presence-v1'],
  { revalidate: 300, tags: ['city-news'] }
)

/**
 * Non-empty city news categories + whether Spor section should show.
 * Single pool read — no per-category Firestore queries.
 */
export async function getCityNavPresence(citySlug: string): Promise<CityNavPresence> {
  return getCityNavPresenceCached(citySlug.trim().toLowerCase())
}

/**
 * Returns only top-level categories that have at least one published article
 * for the given city. Used to build the city nav dynamically.
 */
export async function getCityCategories(citySlug: string): Promise<CityCategory[]> {
  const { categories } = await getCityNavPresence(citySlug)
  return categories
}

// ─── City homepage feed (national layout, city-scoped pool) ───────────────────

function isCityBreakingItem(item: NewsItem): boolean {
  if (item.articleFormat === 'column' || item.articleFormat === 'analysis') return false
  if (!(item.breaking === true || item.category === 'son-dakika')) return false
  return isLocalScopedNews({
    category: item.category,
    originalCategoryId: item.originalCategoryId,
    citySlug: item.citySlug,
  })
}

function compareFeaturedPriority(a: NewsItem, b: NewsItem): number {
  const aPub = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
  const bPub = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
  const aPin = Date.parse(a.localFeaturedAt ?? a.featuredAt ?? '') || aPub
  const bPin = Date.parse(b.localFeaturedAt ?? b.featuredAt ?? '') || bPub
  if (aPin !== bPin) return bPin - aPin
  return bPub - aPub
}

function bucketCityFeatured(
  pool: NewsItem[],
  citySlug: string,
  limit: number,
  pinned: NewsItem[] = []
): NewsItem[] {
  const seen = new Set<string>()
  const merged: NewsItem[] = []
  for (const item of [...pinned, ...pool]) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    merged.push(item)
  }
  const pins = merged
    .filter((item) => isCityFeaturedPin({ ...item, forCitySlug: citySlug }))
    .sort(compareFeaturedPriority)
  if (pins.length > 0) return pins.slice(0, limit)
  return pickCityFeaturedCarouselItems(pool, citySlug, limit)
}

function bucketCityCategoryRails(
  pool: NewsItem[],
  categories: readonly string[],
  perCategory = HOME_CATEGORY_RAIL_FETCH
): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const category of categories) {
    const family = new Set(getCategoryFamily(category))
    const limit = category === 'gundem' ? HOME_CATEGORY_RAIL_GUNDEM_FETCH : perCategory
    const items = pool.filter((item) => item.category && family.has(item.category)).slice(0, limit)
    if (items.length > 0) rails[category as HomeCategorySlug] = items
  }
  return rails
}

/** Spor alt kategorileri (futbol, basketbol, …) için ray bucket — Ana Feed ile aynı görsel dil. */
function bucketCitySectionRails(
  pool: NewsItem[],
  sectionIds: readonly string[],
  perCategory = HOME_CATEGORY_RAIL_FETCH
): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const sectionId of sectionIds) {
    const family = new Set(getCategoryFamily(sectionId))
    const items = pool.filter((item) => item.category && family.has(item.category)).slice(0, perCategory)
    if (items.length > 0) {
      rails[sectionId as HomeCategorySlug] = items
    }
  }
  return rails
}

function deriveSporRailSectionIds(pool: NewsItem[]): string[] {
  const sectionIds = getThemedCategorySectionIds('spor')
  const withContent = sectionIds.filter((id) => {
    const family = new Set(getCategoryFamily(id))
    return pool.some((item) => item.category && family.has(item.category))
  })
  return withContent.length > 0 ? withContent : ['spor']
}

/**
 * CMS “Yerelde öne çıkan” for a city tenant — explicit localFeatured, or legacy
 * featured + yerel category tree + matching citySlug.
 */
async function fetchCityFeaturedNews(citySlug: string, limit: number): Promise<NewsItem[]> {
  const db = getAdminFirestore()
  const scan = Math.max(limit * 8, 80)
  const byId = new Map<string, NewsItem>()
  const normalized = citySlug.trim().toLowerCase()

  const accept = (item: NewsItem | null): item is NewsItem =>
    Boolean(item && isCityFeaturedPin({ ...item, category: item.category, forCitySlug: normalized }))

  const mergeDocs = (docs: Array<{ id: string; data: () => NewsDocument }>) => {
    for (const doc of docs) {
      const item = docToNewsItem(doc.id, doc.data())
      if (!accept(item)) continue
      byId.set(item.id, item)
    }
  }

  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('localFeatured', '==', true)
      .orderBy('localFeaturedAt', 'desc')
      .limit(scan)
      .get()
    mergeDocs(snap.docs)
  } catch (error) {
    console.warn('[cityNewsService] city localFeaturedAt order failed:', error)
  }

  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('localFeatured', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(scan)
      .get()
    mergeDocs(snap.docs)
  } catch (error) {
    console.warn('[cityNewsService] city localFeatured query failed:', error)
  }

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
    console.warn('[cityNewsService] city featuredAt order failed:', error)
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
    console.warn('[cityNewsService] city featured query failed:', error)
  }

  // Prefer a direct city scan when global featured scan missed older pins.
  if (byId.size < limit) {
    try {
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .where('citySlug', '==', normalized)
        .orderBy('publishedAt', 'desc')
        .limit(Math.max(limit * 10, 100))
        .get()
      for (const doc of snap.docs) {
        const item = docToNewsItem(doc.id, doc.data() as NewsDocument)
        if (!accept(item)) continue
        byId.set(item.id, item)
      }
    } catch (error) {
      console.warn('[cityNewsService] city featured citySlug scan failed:', error)
    }
  }

  return [...byId.values()].sort(compareFeaturedPriority).slice(0, limit)
}

const EMPTY_HOME_FEED: HomeFeedInitialData = {
  breaking: [],
  featured: [],
  latest: [],
  trending: [],
  trendFeed: [],
  mostRead: [],
  categoryRails: {},
}

function deriveRailCategoriesFromPool(pool: NewsItem[]): HomeCategorySlug[] {
  return HOME_CATEGORY_RAILS.filter((category) => {
    const family = new Set(getCategoryFamily(category))
    return pool.some((item) => item.category && family.has(item.category))
  })
}

function buildCityFeedFromPool(
  pool: NewsItem[],
  citySlug: string,
  railCategoryIds: readonly string[],
  bucketRails: (
    pool: NewsItem[],
    ids: readonly string[]
  ) => Partial<Record<HomeCategorySlug, NewsItem[]>> = bucketCityCategoryRails,
  featuredPinned: NewsItem[] = []
): HomeFeedInitialData {
  if (pool.length === 0 && featuredPinned.length === 0) return EMPTY_HOME_FEED

  const now = Date.now()
  const nonBreaking = pool.filter((item) => !isCityBreakingItem(item))
  const categoryRails = bucketRails(pool, railCategoryIds)
  const slimRails: HomeFeedInitialData['categoryRails'] = {}
  for (const [key, items] of Object.entries(categoryRails)) {
    slimRails[key as HomeCategorySlug] = slimNewsItemsForFeed(items ?? [])
  }

  const trending = pickTrending(nonBreaking, 6, undefined, now)
  const withViews = nonBreaking.filter((p) => typeof p.views === 'number' && (p.views ?? 0) > 0)
  const mostRead =
    withViews.length > 0
      ? [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6)
      : nonBreaking.slice(0, 6)

  return {
    breaking: slimNewsItemsForFeed(pool.filter(isCityBreakingItem).slice(0, 8)),
    featured: slimNewsItemsForFeed(
      bucketCityFeatured(pool, citySlug, HOME_FEATURED_LIMIT, featuredPinned)
    ),
    latest: slimNewsItemsForFeed(rankFeedHotAware(nonBreaking, now).slice(0, 16)),
    trending: slimNewsItemsForFeed(trending),
    trendFeed: slimNewsItemsForFeed(pickTrendFeed(nonBreaking, 12, now)),
    mostRead: slimNewsItemsForFeed(mostRead),
    categoryRails: slimRails,
  }
}

const getCityHomeFeedCached = unstable_cache(
  async (citySlug: string): Promise<HomeFeedInitialData> => {
    const [pool, featuredPinned] = await Promise.all([
      getCityNews(citySlug, 60),
      fetchCityFeaturedNews(citySlug, HOME_FEATURED_LIMIT),
    ])
    if (pool.length === 0 && featuredPinned.length === 0) return EMPTY_HOME_FEED

    const cityCategories = await deriveCityCategoriesFromPool(pool)
    // All non-empty city categories (incl. yerel-only chips like yerel-duyuru).
    const railCategoryIds = cityCategories.map((c) => c.id)

    return buildCityFeedFromPool(pool, citySlug, railCategoryIds, bucketCityCategoryRails, featuredPinned)
  },
  ['city-home-feed-v8'],
  { revalidate: 120, tags: ['city-news'] }
)

const getCityDistrictFeedCached = unstable_cache(
  async (citySlug: string, districtSlug: string): Promise<HomeFeedInitialData> => {
    const pool = await getCityNewsByDistrict(citySlug, districtSlug, 60)
    return buildCityFeedFromPool(pool, citySlug, deriveRailCategoriesFromPool(pool))
  },
  ['city-district-feed-v4'],
  { revalidate: 120, tags: ['city-news'] }
)

/** National-style homepage feed payload scoped to a city tenant. */
export async function getCityHomeFeedInitialData(citySlug: string): Promise<HomeFeedInitialData> {
  return getCityHomeFeedCached(citySlug.trim().toLowerCase())
}

/** National-style homepage feed payload scoped to a city district. */
export async function getCityDistrictFeedInitialData(
  citySlug: string,
  districtSlug: string
): Promise<HomeFeedInitialData> {
  return getCityDistrictFeedCached(
    citySlug.trim().toLowerCase(),
    districtSlug.trim().toLowerCase()
  )
}

const getCitySporFeedCached = unstable_cache(
  async (citySlug: string): Promise<HomeFeedInitialData> => {
    const pool = await getCityNewsByCategory(citySlug, 'spor', 60)
    const railSectionIds = deriveSporRailSectionIds(pool)
    return buildCityFeedFromPool(pool, citySlug, railSectionIds, bucketCitySectionRails)
  },
  ['city-spor-feed-v4'],
  { revalidate: 120, tags: ['city-news'] }
)

/** Ana Feed layout payload scoped to city spor (+ alt kategoriler). */
export async function getCitySporFeedInitialData(citySlug: string): Promise<HomeFeedInitialData> {
  return getCitySporFeedCached(citySlug.trim().toLowerCase())
}

const getCityCategoryFeedCached = unstable_cache(
  async (citySlug: string, categoryId: string): Promise<HomeFeedInitialData> => {
    const pool = await getCityNewsByCategory(citySlug, categoryId, 60)
    return buildCityFeedFromPool(pool, citySlug, [categoryId])
  },
  ['city-category-feed-v3'],
  { revalidate: 120, tags: ['city-news'] }
)

/**
 * Ana Feed layout payload for a city category pill
 * (siyaset family includes yerel-siyaset via uncapped getCategoryFamily).
 */
export async function getCityCategoryFeedInitialData(
  citySlug: string,
  categoryId: string
): Promise<HomeFeedInitialData> {
  return getCityCategoryFeedCached(
    citySlug.trim().toLowerCase(),
    categoryId.trim().toLowerCase()
  )
}
