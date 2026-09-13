import { dedupKeysFromMetadata } from '@/video/domain/dedup'
import type { VideoRegisterResult } from '@/video/domain/types'
import { inspectVideoUrl } from './inspect'
import type { VideoLibraryRepository } from './types'

export async function registerVideoUrl(
  url: string,
  createdBy: string,
  repository: VideoLibraryRepository
): Promise<VideoRegisterResult> {
  const inspected = await inspectVideoUrl(url, repository)
  if (inspected.existing) {
    return { outcome: 'ALREADY_EXISTS', item: inspected.existing }
  }
  const keys = dedupKeysFromMetadata(inspected.metadata)
  const raced = await repository.findByDedup(keys)
  if (raced) return { outcome: 'ALREADY_EXISTS', item: raced }

  try {
    const item = await repository.insertInspected({
      metadata: inspected.metadata,
      createdBy,
    })
    return { outcome: 'CREATED', item }
  } catch (err) {
    const existing = await repository.findByDedup(keys)
    if (existing) return { outcome: 'ALREADY_EXISTS', item: existing }
    throw err
  }
}
