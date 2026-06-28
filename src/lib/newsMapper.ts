import type { MediaItem, Post, PostType, TimelinePost } from '@/types/post'
import type { PostLocation } from '@/lib/location'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { getCityCategoryName } from '@/constants/cities'
import { formatCityLabel } from '@/lib/location'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'

/** Matches the live Firestore `news` collection schema. */
export interface NewsDocument {
  title?: string
  description?: string
  /** Full article body (used by ANKA workers instead of description). */
  content?: string
  /** Short feed teaser (distinct from title). */
  summary?: string
  author?: string
  authorId?: string
  category?: string
  categoryId?: string
  slug?: string
  city?: string
  district?: string
  citySlug?: string
  location?: PostLocation | null
  tags?: string[]
  videoUrl?: string
  /** TTS / AI audio reel URL (videoProcessor writes this on news docs). */
  audioUrl?: string
  videoEmbedUrl?: string
  hasVideo?: boolean
  thumbnail?: string
  coverImageUrl?: string
  imageUrl?: string
  /**
   * Ordered list of all media (images + video) attached to the article.
   * Replaces the single `thumbnail`/`videoUrl` pair when authored in the
   * admin editor with multiple images. Legacy docs lack this field; the
   * mapper synthesises it from thumbnail + videoUrl as a fallback.
   */
  mediaItems?: Array<{
    type?: 'image' | 'video'
    url?: string
    thumbnailUrl?: string | null
    caption?: string | null
    alt?: string | null
    credit?: string | null
    order?: number
  }>
  /**
   * Lightweight legacy field: extra image URLs beyond `thumbnail`.
   * Older RSS-ingested docs may use this; we merge it into `mediaItems`.
   */
  galleryImages?: string[]
  type?: PostType
  source?: string
  sourceUrl?: string
  sourceLabel?: string
  status?: string
  likesCount?: number
  commentCount?: number
  commentsCount?: number
  savesCount?: number
  sharesCount?: number
  viewsCount?: number
  publishedAt?: number | string | null
  updatedAt?: number | string
  /** RSS / AI ingestion metadata */
  aiGenerated?: boolean
  rssFingerprint?: string
  rssGuid?: string
  ingestionSourceId?: string
  originalTitle?: string
  ingestedAt?: number
  sourcePublishedAt?: number | null
  moderationNote?: string | null
  editorId?: string
  editorType?: string
  confidenceScore?: number
  spot?: string
  seoTitle?: string
  seoDescription?: string
  htmlContent?: string
  readingTimeMinutes?: number
  isBreaking?: boolean
  priorityScore?: number
  createdAt?: number | string | { toDate?: () => Date }
}

export const DEFAULT_CATEGORY_LABEL = 'Genel'
export const DEFAULT_SOURCE = 'NaHaber'

export function getCategoryLabel(categoryId?: string | null): string {
  const value = categoryId?.trim()
  if (!value) return DEFAULT_CATEGORY_LABEL
  if (value.startsWith('city:')) {
    const slug = value.slice(5)
    return getCityCategoryName(slug) || formatCityLabel(slug)
  }
  const topic = DEFAULT_CATEGORIES.find((c) => c.id === value)
  if (topic) return topic.name
  return value
}

function safeIso(d: Date): string {
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function normalizeTimestamp(value: NewsDocument['createdAt']): string {
  if (value == null) return new Date().toISOString()

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return new Date().toISOString()
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    return safeIso(new Date(ms))
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? new Date().toISOString() : safeIso(new Date(parsed))
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      return safeIso(value.toDate())
    } catch {
      return new Date().toISOString()
    }
  }

  return new Date().toISOString()
}

export function inferPostType(data: NewsDocument): PostType {
  if (data.type && ['news', 'video', 'photo', 'user_post'].includes(data.type)) {
    return data.type
  }
  if (data.videoUrl?.trim()) return 'video'
  if (data.thumbnail?.trim() && !data.description?.trim()) return 'photo'
  const author = data.author?.trim()
  if (author && author !== 'nahaber' && author !== DEFAULT_SOURCE) return 'user_post'
  return 'news'
}

export function resolveSource(data: NewsDocument, author: string): string {
  if (data.source?.trim()) return data.source.trim()
  if (author && author !== 'nahaber') return author
  return DEFAULT_SOURCE
}

/**
 * `mediaItems` arrayini Firestore'dan okunan ham veri + legacy alanlardan
 * üretir. Backward compatibility'yi garanti eder:
 *
 *   - Firestore'da `mediaItems` array varsa onu temizle ve sırala
 *   - Yoksa legacy `videoUrl` + `coverImage` + `galleryImages`'tan sentezle
 *
 * Sıralama kuralı:
 *   1. Açık `order` değeri (artan)
 *   2. Aynı order'da array sırası
 *   3. Video > Cover Image > Gallery Images (legacy fallback)
 */
function buildMediaItems(input: {
  storedMediaItems?: NewsDocument['mediaItems']
  galleryImages?: string[]
  coverImage: string | null
  videoUrl: string | null
}): MediaItem[] {
  const result: MediaItem[] = []
  const seenUrls = new Set<string>()

  const pushItem = (item: MediaItem) => {
    const trimmed = item.url.trim()
    if (!trimmed) return
    if (seenUrls.has(trimmed)) return
    seenUrls.add(trimmed)
    result.push({ ...item, url: trimmed })
  }

  // ── 1) Yeni schema: yazılı mediaItems ───────────────────────────────
  if (Array.isArray(input.storedMediaItems) && input.storedMediaItems.length > 0) {
    const sorted = [...input.storedMediaItems]
      .filter((m) => m && typeof m.url === 'string' && m.url.trim())
      .sort((a, b) => {
        const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
        const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
        return ao - bo
      })
    for (const m of sorted) {
      pushItem({
        type: m.type === 'video' ? 'video' : 'image',
        url: m.url as string,
        thumbnailUrl: m.thumbnailUrl?.trim() || null,
        caption: m.caption?.trim() || null,
        alt: m.alt?.trim() || null,
        credit: m.credit?.trim() || null,
        order: typeof m.order === 'number' ? m.order : undefined,
      })
    }
  }

  // ── 2) Legacy fallback: video item (yoksa ekle, varsa atla) ──────────
  if (input.videoUrl && !result.some((m) => m.type === 'video')) {
    pushItem({
      type: 'video',
      url: input.videoUrl,
      thumbnailUrl: input.coverImage,
      caption: null,
    })
  }

  // ── 3) Legacy fallback: cover image ──────────────────────────────────
  if (input.coverImage) {
    pushItem({
      type: 'image',
      url: input.coverImage,
      thumbnailUrl: input.coverImage,
      caption: null,
    })
  }

  // ── 4) Legacy fallback: galleryImages[] ──────────────────────────────
  if (Array.isArray(input.galleryImages)) {
    for (const url of input.galleryImages) {
      if (typeof url === 'string' && url.trim()) {
        pushItem({
          type: 'image',
          url: url.trim(),
          thumbnailUrl: url.trim(),
          caption: null,
        })
      }
    }
  }

  return result
}

/**
 * YouTube watch URL'yi (youtube.com/watch?v=ID veya youtu.be/ID)
 * iframe-oynatılabilir embed URL'ye çevirir.
 * Zaten embed URL ise değiştirmez.
 */
function toYouTubeEmbed(url: string): string {
  if (url.includes('/embed/')) return url  // zaten embed
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`
  return url
}

export function isDisplayableNews(data: NewsDocument): boolean {
  return Boolean(
    data.title?.trim() ||
      data.description?.trim() ||
      data.thumbnail?.trim() ||
      data.videoUrl?.trim()
  )
}

export function hasNewsVideoUrl(data: NewsDocument): boolean {
  return Boolean(
    data.videoUrl?.trim() ||
      data.audioUrl?.trim() ||
      data.videoEmbedUrl?.trim() ||
      data.hasVideo
  )
}

export function newsDocToPost(id: string, data: NewsDocument): Post | null {
  if (!isDisplayableNews(data)) return null

  const createdAt = normalizeTimestamp(data.createdAt)
  const publishedAt = normalizeTimestamp(data.publishedAt ?? data.createdAt)
  const updatedAt = normalizeTimestamp(data.updatedAt ?? data.publishedAt ?? data.createdAt)
  const author = (data.author?.trim() || 'nahaber').slice(0, 64)
  // YouTube watch URL → embed URL (iframe oynatma için)
  // Firestore'da videoUrl = watch URL, videoEmbedUrl = embed URL olabilir.
  const rawVideoUrl = data.videoUrl?.trim() ?? ''
  const videoUrl = rawVideoUrl
    ? ((data as { videoEmbedUrl?: string }).videoEmbedUrl?.trim() || toYouTubeEmbed(rawVideoUrl))
    : ''
  const thumbnail =
    data.thumbnail?.trim() ||
    data.coverImageUrl?.trim() ||
    data.imageUrl?.trim() ||
    ''
  const title = data.title?.trim() || 'Başlıksız'
  const description = data.description?.trim() || data.content?.trim() || ''
  const storedSummary = data.summary?.trim() ?? ''
  const summary = storedSummary || description.slice(0, 280)
  const feedTeaser = buildFeedTeaser(title, summary, description)
  const postType = inferPostType(data)
  const source = resolveSource(data, author)

  const imageUrl = thumbnail || null
  const mediaItems = buildMediaItems({
    storedMediaItems: data.mediaItems,
    galleryImages: data.galleryImages,
    coverImage: imageUrl,
    videoUrl: videoUrl || null,
  })

  return {
    id,
    title,
    slug: data.slug?.trim() || id,
    content: description,
    summary,
    feedTeaser,
    spot: data.spot?.trim() || '',
    seoTitle: data.seoTitle?.trim() || '',
    seoDescription: data.seoDescription?.trim() || '',
    authorId: author,
    authorUsername: author,
    authorDisplayName: author,
    authorPhotoURL: null,
    categoryId: data.categoryId?.trim() || data.category?.trim() || '',
    city: data.city?.trim() || null,
    citySlug: data.citySlug?.trim() || null,
    location: data.location ?? null,
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    postType,
    source,
    mediaItems,
    coverImageUrl: imageUrl,
    status: (data.status as Post['status']) ?? 'published',
    visibility: 'public',
    likesCount: data.likesCount ?? 0,
    commentsCount: data.commentCount ?? data.commentsCount ?? 0,
    savesCount: data.savesCount ?? 0,
    sharesCount: data.sharesCount ?? 0,
    viewsCount: data.viewsCount ?? 0,
    isEditorPick: false,
    isTrending: data.editorType === 'trend' || (data.tags ?? []).includes('trending'),
    isBreaking: shouldShowBreakingBadge({
      isBreaking: data.isBreaking ?? data.categoryId === 'son-dakika',
      categoryId: data.categoryId ?? data.category,
    }),
    priorityScore: data.priorityScore ?? 0,
    editorType: data.editorType,
    confidenceScore: data.confidenceScore,
    htmlContent: data.htmlContent?.trim() || undefined,
    readingTimeMinutes: data.readingTimeMinutes,
    sourceUrl: data.sourceUrl?.trim() || undefined,
    audioUrl: data.audioUrl?.trim() || undefined,
    publishedAt,
    createdAt,
    updatedAt,
  }
}

export function mapNewsSnapshot(
  docs: { id: string; data: () => NewsDocument }[]
): Post[] {
  return docs
    .map((d) => newsDocToPost(d.id, d.data()))
    .filter((post): post is Post => post !== null)
}

export function annotateTimelinePosts(
  posts: Post[],
  followingUsernames: Set<string>
): TimelinePost[] {
  return posts.map((post) => ({
    ...post,
    isFromFollowing: followingUsernames.has(post.authorUsername.toLowerCase()),
  }))
}
