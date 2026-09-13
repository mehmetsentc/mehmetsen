import type { VideoLibraryItem, VideoLibraryStatus, VideoPlatform } from '@/video/domain/types'
import type { VideoImportJob, VideoImportJobKind, VideoImportJobStatus } from '@/video/storage/jobs'

export const ACTIVE_DOWNLOAD_STATUSES: VideoImportJobStatus[] = ['QUEUED', 'RUNNING', 'PENDING']

export type ImportSource =
  | { ok: true; downloadUrl: string; suggestedExt: string }
  | { ok: false; code: string; message: string }

export type EnqueueDownloadResult =
  | { outcome: 'QUEUED'; job: VideoImportJob; item: VideoLibraryItem }
  | { outcome: 'ALREADY_QUEUED'; job: VideoImportJob; item: VideoLibraryItem }
  | { outcome: 'ALREADY_IMPORTED'; item: VideoLibraryItem }

export type ImportTickResult =
  | { outcome: 'IDLE' }
  | { outcome: 'SUCCEEDED'; jobId: string; itemId: string; deduped: boolean }
  | { outcome: 'FAILED'; jobId: string; itemId: string; code: string }
  | { outcome: 'REQUEUED'; jobId: string; itemId: string }

export type ImportAsset = {
  originalStorageKey: string
  mimeType: string
  fileSizeBytes: number
  contentHash: string
}

export interface VideoImportStore {
  findItemById(id: string): Promise<VideoLibraryItem | null>
  findItemByContentHash(hash: string, exceptItemId?: string): Promise<VideoLibraryItem | null>
  findActiveDownloadJob(itemId: string): Promise<VideoImportJob | null>
  insertJob(input: {
    itemId: string
    kind: VideoImportJobKind
    payload: Record<string, unknown>
  }): Promise<VideoImportJob>
  claimNextDownloadJob(input: {
    workerId: string
    now: Date
    leaseMs: number
  }): Promise<VideoImportJob | null>
  saveJob(job: VideoImportJob): Promise<void>
  updateItem(id: string, patch: Partial<VideoLibraryItem> & { status?: VideoLibraryStatus }): Promise<VideoLibraryItem>
}

export function isActiveDownloadStatus(status: VideoImportJobStatus): boolean {
  return ACTIVE_DOWNLOAD_STATUSES.includes(status)
}

export function youtubeImportUnsupported(platform: VideoPlatform): boolean {
  return platform === 'youtube'
}
