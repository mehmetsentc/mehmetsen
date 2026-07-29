import type { MediaItem, Post, PostInfographic, PostType, TimelinePost } from '@/types/post'
import type { PostLocation } from '@/lib/location'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { getCityCategoryName } from '@/constants/cities'
import { formatCityLabel } from '@/lib/location'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { sanitizeArticleBlocks, type ArticleBlock } from '@/lib/articleBlocks'

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
  authorUsername?: string
  authorDisplayName?: string
  authorPhotoURL?: string | null
  category?: string
  categoryId?: string
  slug?: string
  city?: string
  district?: string
  citySlug?: string
  districtSlug?: string
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
  /** Admin editöründe paragraflar arasına eklenen görseller */
  additionalImages?: Array<{ url?: string; caption?: string }>
  /** Kapak görseli SEO açıklaması */
  imageCaption?: string
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
  seoKeywords?: string[]
  htmlContent?: string
  bodyBlocks?: ArticleBlock[]
  articleLayout?: 'standard' | 'longform'
  /** Content format: news vs opinion (V2) — independent of articleLayout */
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** Persistent AI persona id (≠ worker editorId) */
  aiEditorId?: string
  /** Denormalized AI flag (optional; prefer aiEditorId / authorId prefix) */
  isAI?: boolean
  readingTimeMinutes?: number
  isBreaking?: boolean
  featured?: boolean
  isEditorPick?: boolean
  priorityScore?: number
  createdAt?: number | string | { toDate?: () => Date }
  isLiveBlog?: boolean
  liveUpdates?: Array<{ id?: string; content?: string; timestamp?: string | number; author?: string }>
  infographic?: {
    title?: string
    stats?: Array<{ label?: string; value?: string; unit?: string }>
    source?: string
  }
  audioReady?: boolean
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
  additionalImages?: NewsDocument['additionalImages']
  coverImage: string | null
  videoUrl: string | null
  imageCaption?: string | null
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
    const coverCaption = input.imageCaption?.trim() || null
    pushItem({
      type: 'image',
      url: input.coverImage,
      thumbnailUrl: input.coverImage,
      caption: coverCaption,
      alt: coverCaption,
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

  // ── 5) Admin editörü: additionalImages[] ───────────────────────────────
  if (Array.isArray(input.additionalImages)) {
    for (const img of input.additionalImages) {
      if (!img?.url?.trim()) continue
      pushItem({
        type: 'image',
        url: img.url.trim(),
        thumbnailUrl: img.url.trim(),
        caption: img.caption?.trim() || null,
      })
    }
  }

  if (input.imageCaption?.trim() && input.coverImage) {
    const caption = input.imageCaption.trim()
    const cover = input.coverImage.trim()
    for (const item of result) {
      if (item.type === 'image' && item.url === cover) {
        if (!item.caption) item.caption = caption
        if (!item.alt) item.alt = caption
        break
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

function normalizeInfographic(data: NewsDocument['infographic']): PostInfographic | undefined {
  if (!data || !Array.isArray(data.stats)) return undefined
  const stats = data.stats
    .filter((s) => s?.label?.trim() && s?.value?.trim())
    .map((s) => ({
      label: String(s.label).trim(),
      value: String(s.value).trim(),
      unit: s.unit?.trim() || undefined,
    }))
  if (stats.length === 0) return undefined
  return {
    title: data.title?.trim() || undefined,
    stats,
    source: data.source?.trim() || undefined,
  }
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
  // Prefer explicit identity fields written by the CMS/admin create path.
  // Never invent an authorId from a display name — that broke /yazar links.
  const authorId = (data.authorId?.trim() || 'nahaber').slice(0, 128)
  const authorUsername = (data.authorUsername?.trim() || data.author?.trim() || 'nahaber').slice(0, 64)
  const authorDisplayName = (
    data.authorDisplayName?.trim() ||
    data.author?.trim() ||
    authorUsername ||
    'nahaber'
  ).slice(0, 120)
  const author = authorDisplayName
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
  const imageCaption = data.imageCaption?.trim() || null
  const additionalImages = Array.isArray(data.additionalImages)
    ? data.additionalImages
        .filter((img) => img?.url?.trim())
        .map((img) => ({
          url: img.url!.trim(),
          caption: img.caption?.trim() ?? '',
        }))
    : undefined

  const mediaItems = buildMediaItems({
    storedMediaItems: data.mediaItems,
    galleryImages: data.galleryImages,
    additionalImages: data.additionalImages,
    coverImage: imageUrl,
    videoUrl: videoUrl || null,
    imageCaption,
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
    seoKeywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : [],
    authorId,
    authorUsername,
    authorDisplayName,
    authorPhotoURL: (data as { authorPhotoURL?: string | null }).authorPhotoURL?.trim() || null,
    categoryId: data.categoryId?.trim() || data.category?.trim() || '',
    city: data.city?.trim() || null,
    citySlug: data.citySlug?.trim() || null,
    districtSlug: data.districtSlug?.trim() || null,
    location: data.location ?? null,
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    postType,
    source,
    mediaItems,
    additionalImages,
    imageCaption,
    coverImageUrl: imageUrl,
    status: (data.status as Post['status']) ?? 'published',
    visibility: 'public',
    likesCount: data.likesCount ?? 0,
    commentsCount: data.commentCount ?? data.commentsCount ?? 0,
    savesCount: data.savesCount ?? 0,
    sharesCount: data.sharesCount ?? 0,
    viewsCount: data.viewsCount ?? 0,
    isEditorPick: data.featured === true || data.isEditorPick === true,
    featured: data.featured === true || data.isEditorPick === true,
    isTrending: data.editorType === 'trend' || (data.tags ?? []).includes('trending'),
    isBreaking: shouldShowBreakingBadge({
      isBreaking: data.isBreaking ?? data.categoryId === 'son-dakika',
      categoryId: data.categoryId ?? data.category,
      articleFormat:
        data.articleFormat === 'column' || data.articleFormat === 'analysis'
          ? data.articleFormat
          : 'standard',
    }),
    priorityScore: data.priorityScore ?? 0,
    editorType: data.editorType,
    confidenceScore: data.confidenceScore,
    htmlContent: data.htmlContent?.trim() || undefined,
    bodyBlocks: sanitizeArticleBlocks(data.bodyBlocks),
    articleLayout: data.articleLayout === 'longform' ? 'longform' : 'standard',
    articleFormat:
      data.articleFormat === 'column' || data.articleFormat === 'analysis'
        ? data.articleFormat
        : 'standard',
    aiEditorId: data.aiEditorId?.trim() || undefined,
    authorIsAI:
      Boolean(data.aiEditorId?.trim()) ||
      authorId.startsWith('ai_editor_') ||
      data.isAI === true,
    readingTimeMinutes: data.readingTimeMinutes,
    sourceUrl: data.sourceUrl?.trim() || undefined,
    audioUrl: data.audioUrl?.trim() || undefined,
    audioReady: data.audioReady,
    infographic: normalizeInfographic(data.infographic),
    isLiveBlog: data.isLiveBlog === true,
    liveUpdates: Array.isArray(data.liveUpdates)
      ? data.liveUpdates
          .filter((u) => u?.content)
          .map((u, i) => ({
            id: String(u.id ?? `update-${i}`),
            content: String(u.content ?? ''),
            timestamp: String(u.timestamp ?? publishedAt ?? createdAt),
            author: u.author ? String(u.author) : undefined,
          }))
      : undefined,
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
