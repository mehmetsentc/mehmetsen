export const VIDEO_IMPORT_JOB_KINDS = [
  'DOWNLOAD',
  'POSTER',
  'TRANSCODE',
  'MANIFEST',
] as const

export type VideoImportJobKind = (typeof VIDEO_IMPORT_JOB_KINDS)[number]

export const VIDEO_IMPORT_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
] as const

export type VideoImportJobStatus = (typeof VIDEO_IMPORT_JOB_STATUSES)[number]

export type VideoImportJob = {
  id: string
  itemId: string
  kind: VideoImportJobKind
  status: VideoImportJobStatus
  attempts: number
  lastError: string | null
  payload: Record<string, unknown>
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
