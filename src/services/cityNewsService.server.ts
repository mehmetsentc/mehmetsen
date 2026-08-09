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
import { getCategoryFamily, getHomeFeedCategoryFamily } from '@/constants/config'
import { pickTrendFeed, pickTrending, rankFeedHotAware } from '@/lib/feedRanking'
import { slimNewsItemsForFeed } from '@/lib/newsItemUtils'
import { isPostgresReadsEnabled } from '@/db'
import { DISTRICT_DISPLAY_NAMES } from '@/constants/cities'

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
  district?: string
  districtSlug?: string
  tags?: string[]
  views?: number
  likesCount?: number
  commentsCount?: number
  isBreaking?: boolean
  featured?: boolean
  featuredAt?: number | { _seconds?: number }
  source?: string
  articleFormat?: string
  seoTitle?: string
  videoUrl?: string
  readingMinutes?: number
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
    featured: data.featured === true,
    featuredAt:
      typeof data.featuredAt === 'number' && data.featuredAt > 0
        ? new Date(data.featuredAt).toISOString()
        : data.featuredAt && typeof (data.featuredAt as { _seconds?: number })._seconds === 'number'
          ? new Date((data.featuredAt as { _seconds: number })._seconds * 1000).toISOString()
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
  ['city-news-district-v2'],
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

const getCityCategoriesCached = unstable_cache(
  async (citySlug: string): Promise<CityCategory[]> => {
    const { DEFAULT_CATEGORIES } = await import('@/constants/config')

    let distinctCategoryIds: string[] = []

    if (isPostgresReadsEnabled()) {
      try {
        const { getDb, schema } = await import('@/db')
        const { eq, and, sql } = await import('drizzle-orm')
        const db = getDb()

        const rows = await db
          .selectDistinct({ categoryId: schema.news.categoryId })
          .from(schema.news)
          .where(
            and(
              eq(schema.news.status, 'published'),
              eq(schema.news.citySlug, citySlug),
              sql`${schema.news.categoryId} IS NOT NULL`
            )
          )

        distinctCategoryIds = rows
          .map((r) => r.categoryId)
          .filter((id): id is string => Boolean(id))
      } catch (error) {
        console.warn('[cityNewsService] getCityCategories Postgres failed, falling back:', error)
      }
    }

    if (distinctCategoryIds.length === 0) {
      try {
        const db = getAdminFirestore()
        const snap = await db
          .collection(NEWS_COLLECTION)
          .where('status', '==', 'published')
          .where('citySlug', '==', citySlug)
          .select('categoryId')
          .get()

        const categorySet = new Set<string>()
        for (const doc of snap.docs) {
          const catId = doc.data().categoryId
          if (catId && typeof catId === 'string') {
            categorySet.add(catId.trim())
          }
        }
        distinctCategoryIds = Array.from(categorySet)
      } catch (error) {
        console.warn('[cityNewsService] getCityCategories Firebase failed:', error)
        return []
      }
    }

    const idSet = new Set(distinctCategoryIds)
    // Also include parent categories when subcategories have articles
    for (const cat of DEFAULT_CATEGORIES) {
      if (cat.parentId && idSet.has(cat.id)) {
        idSet.add(cat.parentId)
      }
    }

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
  },
  ['city-categories-v2'],
  { revalidate: 300, tags: ['city-news'] }
)

/**
 * Returns only top-level categories that have at least one published article
 * for the given city. Used to build the city nav dynamically.
 */
export async function getCityCategories(citySlug: string): Promise<CityCategory[]> {
  return getCityCategoriesCached(citySlug.trim().toLowerCase())
}

// ─── City homepage feed (national layout, city-scoped pool) ───────────────────

function isCityBreakingItem(item: NewsItem): boolean {
  if (item.articleFormat === 'column' || item.articleFormat === 'analysis') return false
  return item.breaking === true || item.category === 'son-dakika'
}

function compareFeaturedPriority(a: NewsItem, b: NewsItem): number {
  const aPub = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
  const bPub = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
  const aPin = Date.parse(a.featuredAt ?? '') || aPub
  const bPin = Date.parse(b.featuredAt ?? '') || bPub
  if (aPin !== bPin) return bPin - aPin
  return bPub - aPub
}

function bucketCityFeatured(pool: NewsItem[], limit: number): NewsItem[] {
  const featured = pool.filter((p) => p.featured === true).sort(compareFeaturedPriority)
  if (featured.length >= limit) return featured.slice(0, limit)
  const seen = new Set(featured.map((i) => i.id))
  const withImages = pool.filter((p) => p.imageUrl && !seen.has(p.id))
  return [...featured, ...withImages].slice(0, limit)
}

function bucketCityCategoryRails(
  pool: NewsItem[],
  categories: readonly HomeCategorySlug[],
  perCategory = HOME_CATEGORY_RAIL_FETCH
): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const rails: Partial<Record<HomeCategorySlug, NewsItem[]>> = {}
  for (const category of categories) {
    const family = new Set(getHomeFeedCategoryFamily(category))
    const limit = category === 'gundem' ? HOME_CATEGORY_RAIL_GUNDEM_FETCH : perCategory
    const items = pool.filter((item) => item.category && family.has(item.category)).slice(0, limit)
    if (items.length > 0) rails[category] = items
  }
  return rails
}

const getCityHomeFeedCached = unstable_cache(
  async (citySlug: string): Promise<HomeFeedInitialData> => {
    const pool = await getCityNews(citySlug, 60)
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

    const cityCategories = await getCityCategories(citySlug)
    const railCategoryIds = cityCategories
      .map((c) => c.id)
      .filter((id): id is HomeCategorySlug =>
        (HOME_CATEGORY_RAILS as readonly string[]).includes(id)
      )

    const now = Date.now()
    const nonBreaking = pool.filter((item) => !isCityBreakingItem(item))
    const categoryRails = bucketCityCategoryRails(pool, railCategoryIds)
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
      featured: slimNewsItemsForFeed(bucketCityFeatured(pool, HOME_FEATURED_LIMIT)),
      latest: slimNewsItemsForFeed(rankFeedHotAware(nonBreaking, now).slice(0, 16)),
      trending: slimNewsItemsForFeed(trending),
      trendFeed: slimNewsItemsForFeed(pickTrendFeed(nonBreaking, 12, now)),
      mostRead: slimNewsItemsForFeed(mostRead),
      categoryRails: slimRails,
    }
  },
  ['city-home-feed-v1'],
  { revalidate: 120, tags: ['city-news'] }
)

/** National-style homepage feed payload scoped to a city tenant. */
export async function getCityHomeFeedInitialData(citySlug: string): Promise<HomeFeedInitialData> {
  return getCityHomeFeedCached(citySlug.trim().toLowerCase())
}
