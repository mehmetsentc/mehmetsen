import { ROUTES } from '@/constants/routes'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { hasVideoContent } from '@/lib/postUtils'
import type { TimelinePost } from '@/types/post'

export function categoryPostHref(post: TimelinePost): string {
  if (hasVideoContent(post)) return ROUTES.REELS_VIDEO(post.id)
  if (post.slug && post.slug !== post.id) return ROUTES.NEWS_DETAIL(post.slug)
  return ROUTES.POST_DETAIL(post.id)
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
