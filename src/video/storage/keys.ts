import { buildVideoLibraryMediaKey as buildSharedVideoLibraryMediaKey } from '@/lib/storage'

export type VideoAssetKind = 'original' | 'playback' | 'poster' | 'manifest' | 'rendition'

export type VideoLibraryStorageKeyInput = {
  itemId: string
  kind: VideoAssetKind
  filename: string
  height?: number
}

/**
 * R2 object key prefix for Video Library.
 * Reuses the existing nahaber-media bucket via getStorage().
 */
export function buildVideoLibraryMediaKey(input: VideoLibraryStorageKeyInput): string {
  return buildSharedVideoLibraryMediaKey(input)
}
