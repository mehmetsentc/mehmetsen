import type { MediaItem, Post, PostStatus } from '@/types/post'
import { ROUTES } from '@/constants/routes'

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

export function getPostCoverAlt(post: Pick<Post, 'title' | 'imageCaption'>): string {
  return post.imageCaption?.trim() || post.title.trim() || 'Haber görseli'
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

/** True when the post is a dedicated Teve/reels item — not a news article that merely includes a video. */
export function isReelsVideoPost(post: Pick<Post, 'postType' | 'slug' | 'content' | 'summary' | 'bodyBlocks'> & {
  description?: string
  spot?: string
}): boolean {
  if (post.postType === 'video') return true
  if (post.postType === 'news' || post.postType === 'photo' || post.postType === 'user_post') {
    return false
  }
  if (post.slug?.startsWith('video-')) return true
  if (Array.isArray(post.bodyBlocks) && post.bodyBlocks.length > 0) return false
  const body = (
    post.content ||
    post.description ||
    post.spot ||
    post.summary ||
    ''
  ).trim()
  // Legacy docs without postType: treat short video-only items as reels.
  return body.length < 200
}

/** Canonical public URL for opening a post from feeds/cards. */
export function getPostDetailHref(
  post: Pick<Post, 'id' | 'slug' | 'postType' | 'content' | 'summary' | 'bodyBlocks' | 'mediaItems'> & {
    description?: string
    spot?: string
    audioUrl?: string | null
  }
): string {
  if (isReelsVideoPost(post) && hasVideoContent(post as Post)) {
    return ROUTES.REELS_VIDEO(post.id)
  }
  if (post.slug?.trim() && post.slug !== post.id) {
    return ROUTES.NEWS_DETAIL(post.slug)
  }
  return ROUTES.POST_DETAIL(post.id)
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(count)
}

const INGESTION_TAG =
  '(?:scraper|rss|feed|ingest|worker|crawler|bot|harvester|sync)'

/** Strip internal ingestion labels from public source attribution. */
export function formatPublicSourceLabel(source: string | null | undefined): string {
  const trimmed = (source ?? '').trim()
  if (!trimmed) return ''
  return trimmed
    .replace(new RegExp(`\\s*[\\(（]\\s*${INGESTION_TAG}\\s*[\\)）]\\s*`, 'gi'), ' ')
    .replace(new RegExp(`\\s*[|·•—–-]\\s*${INGESTION_TAG}\\s*$`, 'gi'), '')
    .replace(new RegExp(`\\s+${INGESTION_TAG}\\s*$`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Public-facing source label for a post (author card, Kaynak link, badges). */
export function getPostPublicSource(post: Pick<Post, 'source'>): string {
  return formatPublicSourceLabel(post.source)
}

/** Public byline — syndicated news shows the site brand, not upstream RSS labels. */
export function getArticleBylineName(post: Post): string {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const display = post.authorDisplayName?.trim()
  const username = post.authorUsername?.trim()
  const isRealPerson =
    Boolean(display) &&
    display !== 'nahaber' &&
    display.toLocaleLowerCase('tr-TR') !== siteName.toLocaleLowerCase('tr-TR') &&
    post.authorId !== 'nahaber' &&
    username !== 'nahaber'

  if (isRealPerson) return display!
  if (post.postType === 'user_post' && display && display !== 'nahaber') return display
  return siteName
}
