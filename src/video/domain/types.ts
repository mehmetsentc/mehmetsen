export const VIDEO_PLATFORMS = [
  'youtube',
  'instagram',
  'tiktok',
  'x',
  'facebook',
  'generic',
] as const

export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number]

export const VIDEO_LIBRARY_STATUSES = [
  'INSPECTED',
  'PENDING_IMPORT',
  'IMPORTING',
  'READY',
  'FAILED',
  'REJECTED',
] as const

export type VideoLibraryStatus = (typeof VIDEO_LIBRARY_STATUSES)[number]

export const VIDEO_RIGHTS_STATUSES = [
  'UNKNOWN',
  'OWNED',
  'LICENSED',
  'PARTNER',
  'PERMISSION_GRANTED',
  'EMBED_ONLY',
] as const

export type VideoRightsStatus = (typeof VIDEO_RIGHTS_STATUSES)[number]

export const VIDEO_RENDITION_HEIGHTS = [480, 720, 1080] as const
export type VideoRenditionHeight = (typeof VIDEO_RENDITION_HEIGHTS)[number]

export type VideoRendition = {
  height: VideoRenditionHeight | number
  storageKey: string
  mimeType?: string
  fileSizeBytes?: number
}

export type VideoSourceProfile = {
  sourceProfileId: string | null
  sourceUsername: string | null
  sourceName: string | null
  sourceUrl: string | null
}

export type VideoMetadata = {
  platform: VideoPlatform
  platformVideoId: string | null
  originalUrl: string
  normalizedUrl: string
  title: string | null
  description: string | null
  durationMs: number | null
  width: number | null
  height: number | null
  aspectRatio: string | null
  thumbnailUrl: string | null
  publishedAt: Date | null
  source: VideoSourceProfile
}

export type VideoLibraryItem = {
  id: string
  platform: VideoPlatform
  platformVideoId: string | null
  originalUrl: string
  normalizedUrl: string
  sourceProfileId: string | null
  sourceUsername: string | null
  sourceName: string | null
  sourceUrl: string | null
  title: string
  description: string | null
  durationMs: number | null
  width: number | null
  height: number | null
  aspectRatio: string | null
  thumbnailUrl: string | null
  posterStorageKey: string | null
  originalStorageKey: string | null
  playbackStorageKey: string | null
  streamManifestKey: string | null
  renditions: VideoRendition[]
  mimeType: string | null
  fileSizeBytes: number | null
  publishedAt: Date | null
  importedAt: Date | null
  publishedNewsId: string | null
  status: VideoLibraryStatus
  rightsStatus: VideoRightsStatus
  contentHash: string | null
  tags: string[]
  importErrorCode: string | null
  importErrorMessage: string | null
  lastImportJobId: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type VideoInspectResult = {
  metadata: VideoMetadata
  existing: VideoLibraryItem | null
}

export type VideoRegisterResult =
  | { outcome: 'CREATED'; item: VideoLibraryItem }
  | { outcome: 'ALREADY_EXISTS'; item: VideoLibraryItem }
