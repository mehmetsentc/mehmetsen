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
  if (legacyUrl) {
    return {
      type: 'video',
      url: legacyUrl,
      thumbnailUrl: post.coverImageUrl ?? null,
      caption: null,
    }
  }
  return null
}

/** YouTube video ID çıkar (watch, embed, shorts, youtu.be). */
export function parseYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const u = new URL(url.trim())
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return u.searchParams.get('v')
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null
    }
    const m = u.pathname.match(/\/(shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2]
  } catch {
    // fall through to regex
  }
  const m = url.match(/(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? null
}

/** YouTube embed veya watch URL'si mi? */
export function isYouTubeUrl(url: string | null | undefined): boolean {
  return Boolean(parseYouTubeVideoId(url))
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
