import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { formatPublicSourceLabel, hasVideoContent } from '@/lib/postUtils'
import type { NewsItem } from '@/types/newsItem'
import type { TimelinePost } from '@/types/post'

/** Minimal TimelinePost for experience masonry cards from feed API items. */
export function newsItemToTimelinePost(item: NewsItem, fallbackCategoryId?: string): TimelinePost {
  const pubMs = item.publishedAt ? Date.parse(item.publishedAt) : Date.now()
  const publishedAt = Number.isFinite(pubMs) ? new Date(pubMs).toISOString() : new Date().toISOString()
  return {
    id: item.id,
    title: item.title,
    slug: item.slug || item.id,
    content: '',
    summary: item.description ?? '',
    spot: item.description,
    authorId: '',
    authorUsername: '',
    authorDisplayName: item.source ?? 'NaHaber',
    authorPhotoURL: null,
    categoryId: item.category ?? fallbackCategoryId ?? '',
    tags: [],
    mediaItems: item.imageUrl
      ? [{ type: 'image', url: item.imageUrl, thumbnailUrl: item.imageUrl, caption: null }]
      : [],
    coverImageUrl: item.imageUrl ?? null,
    status: 'published',
    visibility: 'public',
    postType: item.videoUrl ? 'video' : 'news',
    source: item.source ?? 'nahaber',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    isTrending: false,
    isBreaking: item.breaking === true,
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  }
}

export function timelinePostToNewsItem(post: TimelinePost): NewsItem {
  const cover = resolveTimelineImageUrl(post).url || undefined
  const extra = [
    ...(post.additionalImages ?? []),
    ...(post.mediaItems ?? [])
      .filter((media) => media.type === 'image' && media.url?.trim() && media.url !== cover)
      .map((media) => ({ url: media.url, caption: media.caption ?? undefined })),
  ]
  const seen = new Set<string>()
  const additionalImages = extra.filter((img) => {
    if (!img.url || seen.has(img.url)) return false
    seen.add(img.url)
    return true
  })
  const raw = post.publishedAt ?? post.createdAt
  const publishedAt =
    typeof raw === 'number' ? new Date(raw).toISOString() : raw ? String(raw) : undefined
  const videoMedia = post.mediaItems?.find((media) => media.type === 'video' && media.url?.trim())

  return {
    id: post.id,
    slug: post.slug || post.id,
    title: post.title,
    description: post.summary || post.spot,
    imageUrl: cover,
    videoUrl: hasVideoContent(post) ? videoMedia?.url || post.audioUrl || 'video' : undefined,
    additionalImages: additionalImages.length > 0 ? additionalImages : undefined,
    category: post.categoryId,
    source: formatPublicSourceLabel(post.sourceLabel || post.source) || post.source,
    publishedAt,
    featured: post.featured === true,
    breaking: post.isBreaking === true,
    likesCount: post.likesCount,
  }
}
