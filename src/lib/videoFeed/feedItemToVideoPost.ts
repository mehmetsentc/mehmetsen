/**
 * VIDEO-RANK-1 — Feed V2 kartını (/api/feed/v2/videos) video akışının
 * kullandığı Post biçimine çevirir. Oynatılacak dosya `item.video`dur
 * (NaHaber Reels'i ya da haberin kendi oynatılabilir videosu).
 */
import type { FeedItemDto } from '@/types/smartFeed'
import type { Post } from '@/types/post'

export type RankedVideoPost = Post & {
  videoUrl: string
  isLiked?: boolean
  isSaved?: boolean
}

export function feedItemToVideoPost(item: FeedItemDto): RankedVideoPost | null {
  const video = item.video?.trim()
  if (!video) return null
  const counts = item.socialCounts
  const source = item.sourceName?.trim() || item.publisher?.name?.trim() || 'NaHaber'
  const author = item.authorName?.trim() || 'NaHaber'
  return {
    id: item.articleId,
    title: item.headline,
    slug: item.slug || item.articleId,
    content: item.summary ?? '',
    summary: item.summary ?? '',
    feedTeaser: item.headline,
    authorId: item.authorId?.trim() || 'nahaber',
    authorUsername: item.authorSlug?.trim() || 'nahaber',
    authorDisplayName: author,
    authorPhotoURL: null,
    categoryId: item.category?.trim() || 'gundem',
    city: null,
    citySlug: item.citySlug ?? null,
    location: null,
    tags: item.tags ?? [],
    mediaItems: [{ type: 'video', url: video, thumbnailUrl: item.image, caption: null }],
    coverImageUrl: item.image,
    videoUrl: video,
    status: 'published',
    visibility: 'public',
    postType: 'news',
    source,
    likesCount: counts?.likes ?? 0,
    commentsCount: counts?.comments ?? 0,
    savesCount: counts?.saves ?? 0,
    sharesCount: counts?.shares ?? 0,
    viewsCount: counts?.views ?? 0,
    isEditorPick: false,
    isTrending: false,
    isBreaking: item.breaking,
    isLiked: item.socialState?.liked ?? undefined,
    isSaved: item.socialState?.saved ?? undefined,
    publishedAt: item.publishedAt,
    createdAt: item.publishedAt,
    updatedAt: item.updatedAt,
  }
}

/** Sıralamayı bozmadan izlenenleri sona alır (etkileşim sıralaması yok). */
export function seenLastStable<T extends { id: string }>(posts: T[], seen: Set<string>): T[] {
  const fresh: T[] = []
  const watched: T[] = []
  for (const p of posts) (seen.has(p.id) ? watched : fresh).push(p)
  return [...fresh, ...watched]
}
