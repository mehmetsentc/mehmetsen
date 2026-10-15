import {
  hasPlayableVisualVideo,
  isOwnedNativeVideoUrl,
  parseDailymotionVideoId,
  parseVimeoVideoId,
} from '@/lib/videoFeed/playableVisual'
import { parseYouTubeVideoId } from '@/lib/postUtils'

export type FeedCardVideoKind = 'youtube' | 'vimeo' | 'dailymotion' | 'native'

export type FeedCardVideo =
  | { kind: 'youtube'; videoId: string; url: string }
  | { kind: 'vimeo'; videoId: string; url: string }
  | { kind: 'dailymotion'; videoId: string; url: string }
  | { kind: 'native'; url: string }

/**
 * Canonical news video for /feed-v2 presentation.
 * Unplayable URLs return null so the article can still render as image/text.
 */
export function resolveFeedCardVideo(url: string | null | undefined): FeedCardVideo | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (!hasPlayableVisualVideo({ videoUrl: trimmed })) return null

  const youtubeId = parseYouTubeVideoId(trimmed)
  if (youtubeId) return { kind: 'youtube', videoId: youtubeId, url: trimmed }

  const vimeoId = parseVimeoVideoId(trimmed)
  if (vimeoId) return { kind: 'vimeo', videoId: vimeoId, url: trimmed }

  const dailymotionId = parseDailymotionVideoId(trimmed)
  if (dailymotionId) return { kind: 'dailymotion', videoId: dailymotionId, url: trimmed }

  if (isOwnedNativeVideoUrl(trimmed)) return { kind: 'native', url: trimmed }

  return null
}

/**
 * FEED-VIDEO-1: a NaHaber reel (our own 9:16 MP4 with the headline already in the picture).
 * The feed shows it as a video card — full height, original size, no copy repeated under it.
 */
export function isNahaberReelVideoUrl(url: string | null | undefined): boolean {
  const u = url?.trim() ?? ''
  return /^https:\/\/storage\.googleapis\.com\/nahaberapp\.firebasestorage\.app\/videos\/reels\/[^/?#]+\.mp4(?:[?#]|$)/.test(u)
}

/** Keep DTO.video only when it can actually render as visual video. */
export function sanitizeFeedVideoUrl(url: string | null | undefined): string | null {
  const resolved = resolveFeedCardVideo(url)
  return resolved ? resolved.url : null
}
