import type { MediaItem, Post, PostStatus } from '@/types/post'

// Statuses that must NEVER appear in public surfaces (feeds, trending, search).
// `draft` = in-progress; `pending` = held for moderation/admin approval.
const NON_PUBLIC_STATUSES = new Set<PostStatus>(['draft', 'pending'])

export function isPubliclyVisibleStatus(status?: string): boolean {
  return !NON_PUBLIC_STATUSES.has((status ?? '') as PostStatus)
}

export function getPrimaryVideo(post: Post): MediaItem | null {
  const fromMedia = post.mediaItems?.find((m) => m.type === 'video') ?? null
  if (fromMedia) return fromMedia
  // Fallback: eski YouTube RSS dokümanlarında videoUrl top-level field olarak kaydedildi
  const legacyUrl = (post as Post & { videoUrl?: string }).videoUrl?.trim()
  if (legacyUrl) return { type: 'video', url: legacyUrl, thumbnailUrl: post.coverImageUrl ?? null }
  return null
}

/** YouTube embed veya watch URL'si mi? */
export function isYouTubeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return (
    url.includes('youtube.com/embed/') ||
    url.includes('youtube.com/watch') ||
    url.includes('youtu.be/')
  )
}

export function hasVideoContent(post: Post): boolean {
  return Boolean(
    post.mediaItems?.some((m) => m.type === 'video' && m.url?.trim()) ||
      getPrimaryVideo(post)?.url?.trim() ||
      // AI-generated audio articles (TTS): no video file but playable in Teve feed
      post.audioUrl?.trim()
  )
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(count)
}

/** Public byline — syndicated news shows the site brand, not upstream RSS labels. */
export function getArticleBylineName(post: Post): string {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  if (post.postType === 'user_post' && post.authorDisplayName.trim() && post.authorDisplayName !== 'nahaber') {
    return post.authorDisplayName
  }
  return siteName
}
