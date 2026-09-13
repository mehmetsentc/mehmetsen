import { buildProcessJobPayload } from '@/video/storage/jobs'
import type { VideoImportJob } from '@/video/storage/jobs'
import type { VideoLibraryItem } from '@/video/domain/types'
import type { VideoImportStore } from '@/video/importer/types'

export type EnqueueProcessResult =
  | { outcome: 'QUEUED'; job: VideoImportJob; item: VideoLibraryItem }
  | { outcome: 'ALREADY_QUEUED'; job: VideoImportJob; item: VideoLibraryItem }
  | { outcome: 'ALREADY_PROCESSED'; item: VideoLibraryItem }

export async function enqueueProcessJob(
  itemId: string,
  store: VideoImportStore
): Promise<EnqueueProcessResult> {
  const item = await store.findItemById(itemId)
  if (!item) throw new Error('NOT_FOUND')
  if (!item.originalStorageKey) throw new Error('MISSING_ORIGINAL')

  if (item.status === 'PLAYBACK_READY' && item.playbackStorageKey) {
    return { outcome: 'ALREADY_PROCESSED', item }
  }

  const active = await store.findActiveProcessJob(itemId)
  if (active) return { outcome: 'ALREADY_QUEUED', job: active, item }

  let job: VideoImportJob
  try {
    job = await store.insertJob({
      itemId,
      kind: 'PROCESS',
      payload: buildProcessJobPayload(itemId, item.originalStorageKey),
    })
  } catch {
    const raced = await store.findActiveProcessJob(itemId)
    if (raced) return { outcome: 'ALREADY_QUEUED', job: raced, item }
    throw new Error('ENQUEUE_FAILED')
  }

  const updated = await store.updateItem(itemId, {
    status: 'PROCESSING',
    lastProcessJobId: job.id,
    processErrorCode: null,
    processErrorMessage: null,
    updatedAt: new Date(),
  })
  return { outcome: 'QUEUED', job, item: updated }
}
