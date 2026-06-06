import type { MediaItem, Post } from '@/types/post'

export function getPrimaryVideo(post: Post): MediaItem | null {
  return post.mediaItems?.find((m) => m.type === 'video') ?? null
}

export function hasVideoContent(post: Post): boolean {
  return post.mediaItems?.some((m) => m.type === 'video') ?? false
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(count)
}
