import { DEFAULT_CATEGORIES } from '@/constants/config'
import type { Post } from '@/types/post'

const CATEGORY_GRADIENT: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.id, c.color])
)

/** Static brand asset — shown centered on category-colored gradient when RSS has no thumbnail. */
export const FEED_FALLBACK_LOGO = '/brand/nahaber-logo.png'

export function getCategoryFallbackGradient(categoryId?: string | null): string {
  const id = categoryId?.trim().toLowerCase() || 'gundem'
  return CATEGORY_GRADIENT[id] ?? '#DC2626'
}

type PostImageFields = Pick<Post, 'coverImageUrl' | 'mediaItems' | 'categoryId'>

/** Resolve a real RSS / upload thumbnail from post fields (no synthetic fallback). */
export function resolvePostThumbnail(post: PostImageFields): string | null {
  const cover = post.coverImageUrl?.trim()
  if (cover) return cover

  const videoThumb = post.mediaItems?.find((m) => m.type === 'video')?.thumbnailUrl?.trim()
  if (videoThumb) return videoThumb

  const imageMedia = post.mediaItems?.find((m) => m.type === 'image')?.url?.trim()
  if (imageMedia) return imageMedia

  return null
}

/** Thumbnail for feed cards — real image when available, otherwise category fallback logo. */
export function resolveTimelineImageUrl(post: PostImageFields): {
  url: string
  isFallback: boolean
} {
  const thumbnail = resolvePostThumbnail(post)
  if (thumbnail) return { url: thumbnail, isFallback: false }

  return {
    url: FEED_FALLBACK_LOGO,
    isFallback: true,
  }
}
