import type { StorageProvider } from '@/lib/storage/types'
import {
  isVideoLibraryOneShotValidationEnabled,
  isVercelProductionRuntime,
} from '@/video/featureFlag'
import { processOneImportJob } from '@/video/importer/worker'
import type { ImportTickResult, VideoImportStore } from '@/video/importer/types'

export const ONE_SHOT_WORKER_ID = 'vl-p3b-oneshot'
export const EXPECTED_R2_BUCKET = 'nahaber-media'

export type OneShotGateResult =
  | { allowed: true }
  | { allowed: false; status: number; code: string }

export type OneShotSafeResponse = {
  outcome: ImportTickResult['outcome']
  itemId: string | null
  jobId: string | null
  status: string | null
  itemStatus: string | null
  bytes: number | null
  mime: string | null
  storageKey: string | null
  hashPresent: boolean
  objectExists: boolean | null
  r2Configured: boolean
  bucket: string
  code?: string
}

export function expectedVideoLibraryBucketName(): string {
  const named = process.env.R2_BUCKET_NAME?.trim()
  return named || EXPECTED_R2_BUCKET
}

export function oneShotValidationGate(): OneShotGateResult {
  if (!isVercelProductionRuntime() || !isVideoLibraryOneShotValidationEnabled()) {
    return { allowed: false, status: 404, code: 'VIDEO_LIBRARY_ONE_SHOT_VALIDATION_DISABLED' }
  }
  return { allowed: true }
}

export async function runOneShotImportValidation(deps: {
  store: VideoImportStore
  storage: Pick<StorageProvider, 'upload' | 'exists'>
  r2Configured: boolean
  now?: Date
  download?: Parameters<typeof processOneImportJob>[0]['download']
}): Promise<OneShotSafeResponse> {
  const bucket = expectedVideoLibraryBucketName()
  const result = await processOneImportJob({
    store: deps.store,
    storage: deps.storage,
    workerId: ONE_SHOT_WORKER_ID,
    now: deps.now,
    download: deps.download,
  })

  if (result.outcome === 'IDLE') {
    return {
      outcome: 'IDLE',
      itemId: null,
      jobId: null,
      status: null,
      itemStatus: null,
      bytes: null,
      mime: null,
      storageKey: null,
      hashPresent: false,
      objectExists: null,
      r2Configured: deps.r2Configured,
      bucket,
    }
  }

  const item = await deps.store.findItemById(result.itemId)
  const jobs = await deps.store.listJobs(50)
  const job = jobs.find((j) => j.id === result.jobId) ?? null
  const storageKey = item?.originalStorageKey ?? null
  let objectExists: boolean | null = null
  if (storageKey) {
    try {
      objectExists = await deps.storage.exists(storageKey)
    } catch {
      objectExists = null
    }
  }

  return {
    outcome: result.outcome,
    itemId: result.itemId,
    jobId: result.jobId,
    status: job?.status ?? null,
    itemStatus: item?.status ?? null,
    bytes: item?.fileSizeBytes ?? null,
    mime: item?.mimeType ?? null,
    storageKey,
    hashPresent: Boolean(item?.contentHash),
    objectExists,
    r2Configured: deps.r2Configured,
    bucket,
    code: 'code' in result ? result.code : undefined,
  }
}
