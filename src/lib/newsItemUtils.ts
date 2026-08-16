import { ROUTES } from '@/constants/routes'
import {
  resolveDistrictDisplayLabel,
  withDistrictCategoryLabel,
} from '@/lib/districtLabel'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatPublicSourceLabel } from '@/lib/postUtils'
import type { NewsItem } from '@/types/newsItem'

type TimestampLike =
  | number
  | string
  | null
  | undefined
  | {
      toDate?: () => Date
      toMillis?: () => number
      seconds?: number
      nanoseconds?: number
      _seconds?: number
      _nanoseconds?: number
    }

export function parseFirestoreTimestamp(value: TimestampLike): string | undefined {
  if (value == null) return undefined

  if (typeof value === 'number') {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    return new Date(ms).toISOString()
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate().toISOString()
      } catch {
        /* fall through */
      }
    }
    if (typeof value.toMillis === 'function') {
      try {
        return new Date(value.toMillis()).toISOString()
      } catch {
        /* fall through */
      }
    }
    // JSON / Admin serialized Timestamp shapes
    const seconds =
      typeof value.seconds === 'number'
        ? value.seconds
        : typeof value._seconds === 'number'
          ? value._seconds
          : undefined
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return new Date(seconds * 1000).toISOString()
    }
  }

  return undefined
}

export function docToNewsItem(
  id: string,
  raw: Record<string, unknown>,
  options?: { mode?: 'full' | 'list' }
): NewsItem | null {
  const mode = options?.mode ?? 'full'
  const title = String(raw.title ?? '').trim()
  if (!title) return null

  const categoryId = String(raw.categoryId ?? raw.category ?? '').trim()
  const imageUrl =
    String(raw.imageUrl ?? '').trim() ||
    String(raw.coverImageUrl ?? '').trim() ||
    String(raw.thumbnail ?? '').trim() ||
    String(raw.featuredImage ?? '').trim() ||
    undefined

  const articleFormat =
    raw.articleFormat === 'column' || raw.articleFormat === 'analysis'
      ? (raw.articleFormat as 'column' | 'analysis')
      : 'standard'

  const isBreaking =
    articleFormat !== 'column' &&
    articleFormat !== 'analysis' &&
    (raw.isBreaking === true || raw.breaking === true || categoryId === 'son-dakika')

  const descriptionRaw =
    String(raw.description ?? '').trim() ||
    String(raw.summary ?? '').trim() ||
    String(raw.spot ?? '').trim() ||
    ''
  const contentRaw = String(raw.content ?? '').trim()
  const readingSource = contentRaw || descriptionRaw
  const readingMinutes =
    typeof raw.readingTimeMinutes === 'number' && raw.readingTimeMinutes > 0
      ? Math.max(1, Math.round(raw.readingTimeMinutes))
      : readingSource
        ? Math.max(1, Math.round(readingSource.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200))
        : undefined

  const seoTitleRaw = String(raw.seoTitle ?? '').trim()

  return {
    id,
    slug: String(raw.slug ?? id).trim() || id,
    title,
    description: descriptionRaw
      ? (mode === 'list' ? descriptionRaw.slice(0, 180) : descriptionRaw)
      : undefined,
    // List/feed payloads must stay small — full body only for detail pages.
    content: mode === 'list' ? undefined : contentRaw || undefined,
    readingMinutes,
    imageUrl: imageUrl && imageUrl.length > 5 ? imageUrl : undefined,
    videoUrl: String(raw.videoUrl ?? '').trim() || undefined,
    category: categoryId || undefined,
    originalCategoryId: String(raw.originalCategoryId ?? '').trim() || undefined,
    source:
      formatPublicSourceLabel(String(raw.sourceLabel ?? '')) ||
      formatPublicSourceLabel(String(raw.source ?? '')) ||
      undefined,
    author: String(raw.author ?? '').trim() || undefined,
    url: String(raw.sourceUrl ?? '').trim() || undefined,
    city: String(raw.city ?? '').trim() || undefined,
    citySlug: String(raw.citySlug ?? '').trim().toLowerCase() || undefined,
    district:
      String(raw.district ?? '').trim() ||
      (raw.location &&
      typeof raw.location === 'object' &&
      typeof (raw.location as { district?: unknown }).district === 'string'
        ? String((raw.location as { district: string }).district).trim()
        : '') ||
      undefined,
    districtSlug: String(raw.districtSlug ?? '').trim().toLowerCase() || undefined,
    locationCity: String(raw.locationCity ?? raw.city ?? '').trim() || undefined,
    province: String(raw.province ?? '').trim() || undefined,
    createdAt: parseFirestoreTimestamp(raw.createdAt as TimestampLike),
    publishedAt: parseFirestoreTimestamp(raw.publishedAt as TimestampLike),
    views:
      typeof raw.viewsCount === 'number'
        ? raw.viewsCount
        : typeof raw.views === 'number'
          ? raw.views
          : undefined,
    likesCount: typeof raw.likesCount === 'number' ? raw.likesCount : undefined,
    commentsCount:
      typeof raw.commentsCount === 'number'
        ? raw.commentsCount
        : typeof raw.commentCount === 'number'
          ? raw.commentCount
          : undefined,
    featured: raw.featured === true || raw.isEditorPick === true,
    featuredAt: parseFirestoreTimestamp(raw.featuredAt as TimestampLike),
    localFeatured: raw.localFeatured === true,
    localFeaturedAt: parseFirestoreTimestamp(raw.localFeaturedAt as TimestampLike),
    breaking: isBreaking,
    articleFormat,
    seoTitle: seoTitleRaw && seoTitleRaw !== title ? seoTitleRaw : undefined,
  }
}

/**
 * Strip feed-card payloads for RSC / JSON APIs.
 * Ranking must run on the full list item before calling this.
 */
export function slimNewsItemForFeed(item: NewsItem): NewsItem {
  const slim: NewsItem = {
    id: item.id,
    slug: item.slug,
    title: item.title,
  }

  const description = item.description?.trim()
  if (description) slim.description = description.slice(0, 120)

  if (typeof item.readingMinutes === 'number' && item.readingMinutes > 0) {
    slim.readingMinutes = item.readingMinutes
  }
  if (item.imageUrl) slim.imageUrl = item.imageUrl
  if (item.videoUrl) slim.videoUrl = item.videoUrl
  if (item.category) slim.category = item.category
  if (item.originalCategoryId) slim.originalCategoryId = item.originalCategoryId
  if (item.district) slim.district = item.district
  if (item.districtSlug) slim.districtSlug = item.districtSlug

  const publishedAt = item.publishedAt ?? item.createdAt
  if (publishedAt) slim.publishedAt = publishedAt

  if (typeof item.views === 'number' && item.views > 0) slim.views = item.views
  if (item.featured === true) slim.featured = true
  if (item.featuredAt) slim.featuredAt = item.featuredAt
  if (item.localFeatured === true) slim.localFeatured = true
  if (item.localFeaturedAt) slim.localFeaturedAt = item.localFeaturedAt
  if (item.breaking === true) slim.breaking = true
  if (item.seoTitle) slim.seoTitle = item.seoTitle

  return slim
}

export function slimNewsItemsForFeed(items: NewsItem[]): NewsItem[] {
  return items.map(slimNewsItemForFeed)
}

export function newsItemDetailHref(item: Pick<NewsItem, 'id' | 'slug'>): string {
  const slug = item.slug?.trim()
  if (slug && slug !== item.id) return ROUTES.NEWS_DETAIL(slug)
  return ROUTES.NEWS_DETAIL(item.id)
}

export function newsItemDistrictLabel(item: NewsItem): string | null {
  return resolveDistrictDisplayLabel({
    district: item.district,
    districtSlug: item.districtSlug,
  })
}

/** Category badge text — includes ilçe when geo/CMS set it (e.g. "Yerel Siyaset · Biga"). */
export function newsItemCategoryLabel(item: NewsItem): string {
  return withDistrictCategoryLabel(getCategoryLabel(item.category), newsItemDistrictLabel(item))
}

export function sortNewsByDate(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
    const bTime = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
    return bTime - aTime
  })
}
