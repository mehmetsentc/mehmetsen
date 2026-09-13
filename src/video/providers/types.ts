import type { VideoMetadata, VideoPlatform } from '@/video/domain/types'

export type ImportedVideo = {
  metadata: VideoMetadata
  originalStorageKey?: string
  playbackStorageKey?: string
}

export interface VideoProvider {
  readonly platform: VideoPlatform
  supports(url: string): boolean
  normalizeUrl(url: string): Promise<string>
  getMetadata(url: string): Promise<VideoMetadata>
  /** Optional. V1A does not call this — download lives in a future worker. */
  importVideo?(url: string): Promise<ImportedVideo>
}
