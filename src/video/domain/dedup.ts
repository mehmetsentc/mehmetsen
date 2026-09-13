import type { VideoLibraryItem, VideoMetadata, VideoPlatform } from './types'

export type VideoDedupKeys = {
  platform: VideoPlatform
  platformVideoId: string | null
  normalizedUrl: string
  contentHash: string | null
}

export function dedupKeysFromMetadata(metadata: VideoMetadata): VideoDedupKeys {
  return {
    platform: metadata.platform,
    platformVideoId: metadata.platformVideoId,
    normalizedUrl: metadata.normalizedUrl,
    contentHash: null,
  }
}

export function matchesDedupKeys(
  item: Pick<VideoLibraryItem, 'platform' | 'platformVideoId' | 'normalizedUrl' | 'contentHash'>,
  keys: VideoDedupKeys
): boolean {
  if (item.normalizedUrl === keys.normalizedUrl) return true
  if (
    keys.platformVideoId &&
    item.platform === keys.platform &&
    item.platformVideoId === keys.platformVideoId
  ) {
    return true
  }
  if (keys.contentHash && item.contentHash && item.contentHash === keys.contentHash) {
    return true
  }
  return false
}
