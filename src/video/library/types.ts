import type { VideoLibraryItem, VideoMetadata } from '@/video/domain/types'
import { matchesDedupKeys, type VideoDedupKeys } from '@/video/domain/dedup'

export type VideoLibraryListQuery = {
  limit?: number
  offset?: number
}

export interface VideoLibraryRepository {
  findByDedup(keys: VideoDedupKeys): Promise<VideoLibraryItem | null>
  insertInspected(input: {
    metadata: VideoMetadata
    createdBy: string
  }): Promise<VideoLibraryItem>
  list(query?: VideoLibraryListQuery): Promise<{ items: VideoLibraryItem[]; total: number }>
}

export function pickExisting(
  items: VideoLibraryItem[],
  keys: VideoDedupKeys
): VideoLibraryItem | null {
  return items.find((item) => matchesDedupKeys(item, keys)) ?? null
}
