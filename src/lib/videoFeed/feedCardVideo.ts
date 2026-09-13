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

/** Keep DTO.video only when it can actually render as visual video. */
export function sanitizeFeedVideoUrl(url: string | null | undefined): string | null {
  const resolved = resolveFeedCardVideo(url)
  return resolved ? resolved.url : null
}
