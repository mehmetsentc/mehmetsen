export const VIDEO_IMPORT_JOB_KINDS = [
  'DOWNLOAD',
  'PROCESS',
  'POSTER',
  'TRANSCODE',
  'MANIFEST',
] as const

export type VideoImportJobKind = (typeof VIDEO_IMPORT_JOB_KINDS)[number]

export const VIDEO_IMPORT_JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'PENDING',
] as const

export type VideoImportJobStatus = (typeof VIDEO_IMPORT_JOB_STATUSES)[number]

export type VideoImportJob = {
  id: string
  itemId: string
  kind: VideoImportJobKind
  status: VideoImportJobStatus
  attempts: number
  lastError: string | null
  errorCode: string | null
  payload: Record<string, unknown>
  claimedAt: Date | null
  claimedBy: string | null
  leaseExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * V1A: jobs are typed only. Enqueue/run lives in a worker, never in a Next.js request.
 */
export function buildDownloadJobPayload(itemId: string, sourceUrl: string) {
  return {
    itemId,
    sourceUrl,
    kind: 'DOWNLOAD' as const,
  }
}

export function buildProcessJobPayload(itemId: string, originalStorageKey: string) {
  return {
    itemId,
    originalStorageKey,
    kind: 'PROCESS' as const,
    target: '720p' as const,
  }
}
