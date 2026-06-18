import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { NewsItem } from '@/types/newsItem'

type TimestampLike =
  | number
  | string
  | null
  | undefined
  | { toDate?: () => Date; toMillis?: () => number }

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
      return value.toDate().toISOString()
    }
    if (typeof value.toMillis === 'function') {
      return new Date(value.toMillis()).toISOString()
    }
  }

  return undefined
}

export function docToNewsItem(id: string, raw: Record<string, unknown>): NewsItem | null {
  const title = String(raw.title ?? '').trim()
  if (!title) return null

  const categoryId = String(raw.categoryId ?? raw.category ?? '').trim()
  const imageUrl =
    String(raw.imageUrl ?? '').trim() ||
    String(raw.coverImageUrl ?? '').trim() ||
    String(raw.thumbnail ?? '').trim() ||
    String(raw.featuredImage ?? '').trim() ||
    undefined

  const isBreaking =
    raw.isBreaking === true ||
    raw.breaking === true ||
    categoryId === 'son-dakika'

  return {
    id,
    slug: String(raw.slug ?? id).trim() || id,
    title,
    description:
      String(raw.description ?? '').trim() ||
      String(raw.summary ?? '').trim() ||
      String(raw.spot ?? '').trim() ||
      undefined,
    content: String(raw.content ?? '').trim() || undefined,
    imageUrl: imageUrl && imageUrl.length > 5 ? imageUrl : undefined,
    videoUrl: String(raw.videoUrl ?? '').trim() || undefined,
    category: categoryId || undefined,
    source:
      String(raw.sourceLabel ?? '').trim() ||
      String(raw.source ?? '').trim() ||
      undefined,
    author: String(raw.author ?? '').trim() || undefined,
    url: String(raw.sourceUrl ?? '').trim() || undefined,
    city: String(raw.city ?? '').trim() || undefined,
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
    featured: raw.featured === true,
    breaking: isBreaking,
  }
}

export function newsItemDetailHref(item: Pick<NewsItem, 'id' | 'slug'>): string {
  const slug = item.slug?.trim()
  if (slug && slug !== item.id) return ROUTES.NEWS_DETAIL(slug)
  return ROUTES.NEWS_DETAIL(item.id)
}

export function newsItemCategoryLabel(item: NewsItem): string {
  return getCategoryLabel(item.category)
}

export function sortNewsByDate(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt ?? a.createdAt ?? '') || 0
    const bTime = Date.parse(b.publishedAt ?? b.createdAt ?? '') || 0
    return bTime - aTime
  })
}
