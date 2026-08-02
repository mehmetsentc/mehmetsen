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
