import { newVideoLibraryId } from '@/video/domain/ids'
import { buildDownloadJobPayload } from '@/video/storage/jobs'
import type { VideoImportJob } from '@/video/storage/jobs'
import type { EnqueueDownloadResult, VideoImportStore } from './types'

export async function enqueueDownloadJob(
  itemId: string,
  store: VideoImportStore
): Promise<EnqueueDownloadResult> {
  const item = await store.findItemById(itemId)
  if (!item) throw new Error('NOT_FOUND')

  if (item.status === 'READY' && item.originalStorageKey) {
    return { outcome: 'ALREADY_IMPORTED', item }
  }

  const active = await store.findActiveDownloadJob(itemId)
  if (active) return { outcome: 'ALREADY_QUEUED', job: active, item }

  let job: VideoImportJob
  try {
    job = await store.insertJob({
      itemId,
      kind: 'DOWNLOAD',
      payload: buildDownloadJobPayload(itemId, item.originalUrl),
    })
  } catch {
    const raced = await store.findActiveDownloadJob(itemId)
    if (raced) return { outcome: 'ALREADY_QUEUED', job: raced, item }
    throw new Error('ENQUEUE_FAILED')
  }

  const updated = await store.updateItem(itemId, {
    status: 'PENDING_IMPORT',
    lastImportJobId: job.id,
    importErrorCode: null,
    importErrorMessage: null,
    updatedAt: new Date(),
  })
  return { outcome: 'QUEUED', job, item: updated }
}

export function newQueuedJob(
  itemId: string,
  payload: Record<string, unknown>
): VideoImportJob {
  const now = new Date()
  return {
    id: newVideoLibraryId('vlj'),
    itemId,
    kind: 'DOWNLOAD',
    status: 'QUEUED',
    attempts: 0,
    lastError: null,
    errorCode: null,
    payload,
    claimedAt: null,
    claimedBy: null,
    leaseExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  }
}
