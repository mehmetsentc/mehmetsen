import type { MediaItem, Post, PostStatus } from '@/types/post'

// Statuses that must NEVER appear in public surfaces (feeds, trending, search).
// `draft` = in-progress; `pending` = held for moderation/admin approval.
const NON_PUBLIC_STATUSES = new Set<PostStatus>(['draft', 'pending'])

export function isPubliclyVisibleStatus(status?: string): boolean {
  return !NON_PUBLIC_STATUSES.has((status ?? '') as PostStatus)
}

export function getPrimaryVideo(post: Post): MediaItem | null {
  return post.mediaItems?.find((m) => m.type === 'video') ?? null
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
