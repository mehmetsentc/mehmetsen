import { isPlayableOwnedNativeUrl } from '@/lib/videoFeed/playableVisual'

export type OwnedNativePlaybackCandidate = {
  playbackUrl?: string | null
  videoUrl?: string | null
  videoEmbedUrl?: string | null
  mediaItems?: Array<{ type?: string; url?: string | null }>
}

export type OwnedNativePlayback =
  | { status: 'playback'; url: string }
  | { status: 'original'; url: string }
  | { status: 'none' }

const PLAYBACK_PATH_RE = /\/playback\//i
const PLAYBACK_FILE_RE = /(?:^|\/)(?:playback-\d+p|720p)\.mp4$/i

function pushUrl(urls: string[], value: string | null | undefined) {
  const trimmed = value?.trim()
  if (trimmed) urls.push(trimmed)
}

export function collectOwnedNativeCandidateUrls(
  candidate: OwnedNativePlaybackCandidate | null | undefined
): string[] {
  if (!candidate) return []
  const urls: string[] = []
  pushUrl(urls, candidate.playbackUrl)
  pushUrl(urls, candidate.videoUrl)
  pushUrl(urls, candidate.videoEmbedUrl)
  for (const item of candidate.mediaItems ?? []) {
    if (!item?.type || item.type === 'video') pushUrl(urls, item.url)
  }
  return urls
}

export function looksLikePlaybackAssetUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return PLAYBACK_PATH_RE.test(path) || PLAYBACK_FILE_RE.test(path)
  } catch {
    return PLAYBACK_PATH_RE.test(url) || PLAYBACK_FILE_RE.test(url)
  }
}

/**
 * Current production contract only: Post mediaItems / videoUrl / optional playbackUrl.
 * No Video Library DB. Third-party MP4 and HLS stay rejected.
 */
export function selectOwnedNativePlayback(
  candidate: OwnedNativePlaybackCandidate | null | undefined
): OwnedNativePlayback {
  const urls = collectOwnedNativeCandidateUrls(candidate)
  const playable = urls.filter(isPlayableOwnedNativeUrl)
  if (playable.length === 0) return { status: 'none' }

  const explicitPlayback = candidate?.playbackUrl?.trim()
  if (explicitPlayback && isPlayableOwnedNativeUrl(explicitPlayback)) {
    return { status: 'playback', url: explicitPlayback }
  }

  const playbackShaped = playable.find(looksLikePlaybackAssetUrl)
  if (playbackShaped) return { status: 'playback', url: playbackShaped }

  return { status: 'original', url: playable[0] }
}
