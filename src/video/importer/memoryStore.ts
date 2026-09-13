import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'
import type { VideoImportJob, VideoImportJobKind } from '@/video/storage/jobs'
import { isActiveDownloadStatus, type VideoImportStore } from './types'
import { newQueuedJob } from './enqueue'

export function createMemoryImportStore(seedItems: VideoLibraryItem[] = []): VideoImportStore & {
  items: VideoLibraryItem[]
  jobs: VideoImportJob[]
} {
  const items = [...seedItems]
  const jobs: VideoImportJob[] = []

  return {
    items,
    jobs,
    async findItemById(id) {
      return items.find((i) => i.id === id) ?? null
    },
    async findItemByContentHash(hash, exceptItemId) {
      return (
        items.find(
          (i) => i.contentHash === hash && i.originalStorageKey && i.id !== exceptItemId
        ) ?? null
      )
    },
    async findActiveDownloadJob(itemId) {
      return (
        jobs.find(
          (j) => j.kind === 'DOWNLOAD' && j.itemId === itemId && isActiveDownloadStatus(j.status)
        ) ?? null
      )
    },
    async findActiveProcessJob(itemId) {
      return (
        jobs.find(
          (j) => j.kind === 'PROCESS' && j.itemId === itemId && isActiveDownloadStatus(j.status)
        ) ?? null
      )
    },
    async insertJob(input) {
      const job = newQueuedJob(itemIdSafe(input.itemId), input.payload)
      job.kind = input.kind
      const active = jobs.find(
        (j) => j.itemId === input.itemId && j.kind === input.kind && isActiveDownloadStatus(j.status)
      )
      if (active) {
        throw new Error('DUPLICATE_ACTIVE_JOB')
      }
      jobs.push(job)
      return job
    },
    async claimNextDownloadJob(input) {
      return claimNextKind(jobs, 'DOWNLOAD', input)
    },
    async claimNextProcessJob(input) {
      return claimNextKind(jobs, 'PROCESS', input)
    },
    async saveJob(job) {
      const idx = jobs.findIndex((j) => j.id === job.id)
      if (idx >= 0) jobs[idx] = job
      else jobs.push(job)
    },
    async updateItem(id, patch) {
      const idx = items.findIndex((i) => i.id === id)
      if (idx < 0) throw new Error('NOT_FOUND')
      items[idx] = { ...items[idx], ...patch, id }
      return items[idx]
    },
  }
}

function claimNextKind(
  jobs: VideoImportJob[],
  kind: VideoImportJobKind,
  input: { workerId: string; now: Date; leaseMs: number }
): VideoImportJob | null {
  const due = jobs
    .filter((j) => j.kind === kind && claimable(j, input.now))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
  if (!due) return null
  due.status = 'RUNNING'
  due.claimedAt = input.now
  due.claimedBy = input.workerId
  due.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs)
  due.updatedAt = input.now
  return due
}

function claimable(job: VideoImportJob, now: Date): boolean {
  if (job.status === 'QUEUED' || job.status === 'PENDING') {
    const retryAfter = Number(job.payload.retryAfter ?? 0)
    return !retryAfter || retryAfter <= now.getTime()
  }
  if (job.status === 'RUNNING' && job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= now.getTime()) {
    return true
  }
  return false
}

function itemIdSafe(id: string): string {
  return id || newVideoLibraryId('vli')
}
