import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { getPostDetailHref } from '@/lib/postUtils'
import type { TimelinePost } from '@/types/post'

export function categoryPostHref(post: TimelinePost): string {
  return getPostDetailHref(post)
}

export function categoryPostImage(post: TimelinePost): string {
  return resolveTimelineImageUrl(post).url
}

export function categoryPostSummary(post: TimelinePost): string {
  return (post.summary ?? post.spot ?? '').trim()
}

export function categoryPostTimestamp(post: TimelinePost): number {
  const raw = post.publishedAt ?? post.createdAt
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isFinite(parsed) ? parsed : Date.now()
  }
  return Date.now()
}
