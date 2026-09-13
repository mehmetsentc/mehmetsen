import type { VideoRendition, VideoRenditionHeight } from '@/video/domain/types'
import { VIDEO_RENDITION_HEIGHTS } from '@/video/domain/types'
import { buildVideoLibraryMediaKey } from '@/video/storage/keys'

export type VideoProcessingPlan = {
  originalKey: string
  playbackKey: string
  posterKey: string
  manifestKey: string
  renditions: VideoRendition[]
}

/** Architecture-ready transcoding plan. V1A does not run ffmpeg/HLS. */
export function planPlaybackRenditions(itemId: string): VideoProcessingPlan {
  const renditions: VideoRendition[] = VIDEO_RENDITION_HEIGHTS.map((height: VideoRenditionHeight) => ({
    height,
    storageKey: buildVideoLibraryMediaKey({
      itemId,
      kind: 'rendition',
      height,
      filename: `${height}p.mp4`,
    }),
    mimeType: 'video/mp4',
  }))

  return {
    originalKey: buildVideoLibraryMediaKey({
      itemId,
      kind: 'original',
      filename: 'source.bin',
    }),
    playbackKey: buildVideoLibraryMediaKey({
      itemId,
      kind: 'playback',
      filename: 'playback.mp4',
    }),
    posterKey: buildVideoLibraryMediaKey({
      itemId,
      kind: 'poster',
      filename: 'poster.jpg',
    }),
    manifestKey: buildVideoLibraryMediaKey({
      itemId,
      kind: 'manifest',
      filename: 'index.m3u8',
    }),
    renditions,
  }
}
