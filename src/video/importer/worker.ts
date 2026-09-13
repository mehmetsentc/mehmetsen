import { readFile } from 'node:fs/promises'
import type { StorageProvider } from '@/lib/storage/types'
import { buildVideoLibraryMediaKey } from '@/video/storage/keys'
import type { VideoImportJob } from '@/video/storage/jobs'
import { cleanupTempFile, downloadVideoFile, DownloadFailedError } from './download'
import { resolveImportSource } from './resolveSource'
import { UnsafeDownloadUrlError } from '@/video/security/ssrf'
import type { ImportTickResult, VideoImportStore } from './types'

const MAX_ATTEMPTS = 3
const LEASE_MS = 90_000
const SAFE_ERROR: Record<string, string> = {
  YOUTUBE_NOT_DIRECT_MEDIA: 'YouTube dosyası bu fazda indirilemez.',
  PLATFORM_METADATA_ONLY: 'Bu platformdan dosya içe aktarma henüz yok.',
  NOT_DIRECT_MEDIA: 'Yalnızca doğrudan video dosyası indirilebilir.',
  INVALID_URL: 'Geçersiz indirme adresi.',
  INVALID_PROTOCOL: 'Yalnızca HTTP/HTTPS adresler indirilebilir.',
  BLOCKED_HOST: 'Bu adres güvenlik nedeniyle reddedildi.',
  PRIVATE_IP: 'Özel ağ adresleri indirilemez.',
  FILE_TOO_LARGE: 'Dosya boyutu limiti aşıldı.',
  INVALID_MIME: 'Dosya türü kabul edilmiyor.',
  HTTP_ERROR: 'Kaynak video alınamadı.',
  R2_NOT_CONFIGURED: 'R2 depolama yapılandırılmamış.',
  UPLOAD_FAILED: 'Depolama yüklemesi başarısız.',
  NOT_FOUND: 'Kayıt bulunamadı.',
}

function publicError(code: string): string {
  return SAFE_ERROR[code] ?? 'İçe aktarma başarısız.'
}

function failCode(err: unknown): string {
  if (err instanceof DownloadFailedError || err instanceof UnsafeDownloadUrlError) return err.code
  if (err instanceof Error && err.message && /^[A-Z_]+$/.test(err.message)) return err.message
  return 'IMPORT_FAILED'
}

export type ImportWorkerDeps = {
  store: VideoImportStore
  storage: Pick<StorageProvider, 'upload'>
  workerId?: string
  now?: Date
  leaseMs?: number
  maxAttempts?: number
  download?: typeof downloadVideoFile
}

export async function processOneImportJob(deps: ImportWorkerDeps): Promise<ImportTickResult> {
  const now = deps.now ?? new Date()
  const workerId = deps.workerId ?? `vlw_${now.getTime()}`
  const job = await deps.store.claimNextDownloadJob({
    workerId,
    now,
    leaseMs: deps.leaseMs ?? LEASE_MS,
  })
  if (!job) return { outcome: 'IDLE' }

  const item = await deps.store.findItemById(job.itemId)
  if (!item) {
    await failJob(deps.store, job, 'NOT_FOUND', now, deps.maxAttempts ?? MAX_ATTEMPTS)
    return { outcome: 'FAILED', jobId: job.id, itemId: job.itemId, code: 'NOT_FOUND' }
  }

  await deps.store.updateItem(item.id, {
    status: 'IMPORTING',
    lastImportJobId: job.id,
    importErrorCode: null,
    importErrorMessage: null,
    updatedAt: now,
  })

  const source = resolveImportSource(item)
  if (!source.ok) {
    return finalizeFailure(deps, job, item.id, source.code, now)
  }

  let tempPath: string | null = null
  try {
    const downloaded = await (deps.download ?? downloadVideoFile)({
      url: source.downloadUrl,
      suggestedExt: source.suggestedExt,
    })
    tempPath = downloaded.tempPath

    const existing = await deps.store.findItemByContentHash(downloaded.contentHash, item.id)
    if (existing?.originalStorageKey) {
      await deps.store.updateItem(item.id, {
        status: 'READY',
        originalStorageKey: existing.originalStorageKey,
        mimeType: existing.mimeType ?? downloaded.mimeType,
        fileSizeBytes: existing.fileSizeBytes ?? downloaded.fileSizeBytes,
        contentHash: downloaded.contentHash,
        importedAt: now,
        importErrorCode: null,
        importErrorMessage: null,
        updatedAt: now,
      })
      await succeedJob(deps.store, job, now, { deduped: true, reusedItemId: existing.id })
      return { outcome: 'SUCCEEDED', jobId: job.id, itemId: item.id, deduped: true }
    }

    const originalStorageKey = buildVideoLibraryMediaKey({
      itemId: item.id,
      kind: 'original',
      filename: `original.${downloaded.ext}`,
    })
    const body = await readFile(downloaded.tempPath)
    try {
      await deps.storage.upload(originalStorageKey, body, {
        contentType: downloaded.mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      })
    } catch {
      return finalizeFailure(deps, job, item.id, 'UPLOAD_FAILED', now)
    }

    await deps.store.updateItem(item.id, {
      status: 'READY',
      originalStorageKey,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.fileSizeBytes,
      contentHash: downloaded.contentHash,
      importedAt: now,
      importErrorCode: null,
      importErrorMessage: null,
      updatedAt: now,
    })
    await succeedJob(deps.store, job, now, { deduped: false, originalStorageKey })
    return { outcome: 'SUCCEEDED', jobId: job.id, itemId: item.id, deduped: false }
  } catch (err) {
    const code = failCode(err)
    return finalizeFailure(deps, job, item.id, code, now)
  } finally {
    await cleanupTempFile(tempPath)
  }
}

async function succeedJob(
  store: VideoImportStore,
  job: VideoImportJob,
  now: Date,
  extra: Record<string, unknown>
) {
  job.status = 'SUCCEEDED'
  job.lastError = null
  job.errorCode = null
  job.updatedAt = now
  job.payload = { ...job.payload, ...extra }
  await store.saveJob(job)
}

async function failJob(
  store: VideoImportStore,
  job: VideoImportJob,
  code: string,
  now: Date,
  maxAttempts: number
): Promise<'FAILED' | 'REQUEUED'> {
  job.attempts += 1
  job.errorCode = code
  job.lastError = publicError(code)
  job.updatedAt = now
  if (job.attempts < maxAttempts && retryable(code)) {
    job.status = 'QUEUED'
    job.claimedAt = null
    job.claimedBy = null
    job.leaseExpiresAt = null
    job.payload = { ...job.payload, retryAfter: now.getTime() + job.attempts * 5_000 }
    await store.saveJob(job)
    return 'REQUEUED'
  }
  job.status = 'FAILED'
  await store.saveJob(job)
  return 'FAILED'
}

function retryable(code: string): boolean {
  return code === 'HTTP_ERROR' || code === 'DOWNLOAD_FAILED' || code === 'UPLOAD_FAILED'
}

async function finalizeFailure(
  deps: ImportWorkerDeps,
  job: VideoImportJob,
  itemId: string,
  code: string,
  now: Date
): Promise<ImportTickResult> {
  const result = await failJob(deps.store, job, code, now, deps.maxAttempts ?? MAX_ATTEMPTS)
  await deps.store.updateItem(itemId, {
    status: result === 'REQUEUED' ? 'PENDING_IMPORT' : 'FAILED',
    importErrorCode: code,
    importErrorMessage: publicError(code),
    lastImportJobId: job.id,
    updatedAt: now,
  })
  return { outcome: result, jobId: job.id, itemId, code }
}
