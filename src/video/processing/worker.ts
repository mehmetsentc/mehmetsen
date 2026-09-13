import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { videoLibraryMaxBytes, videoLibraryProcessTimeoutMs } from '@/video/featureFlag'
import { buildVideoLibraryMediaKey } from '@/video/storage/keys'
import type { VideoImportJob } from '@/video/storage/jobs'
import type { VideoImportStore } from '@/video/importer/types'
import type { VideoLibraryItem } from '@/video/domain/types'
import { ALLOWED_ORIGINAL_MIME, MAX_STDERR_BYTES, PLAYBACK_MIME, POSTER_MIME } from './limits'
import { buildPlaybackEncodeArgs, buildPosterPngArgs, buildCwebpArgs } from './encodeArgs'
import type { VideoObjectStore } from './objectStore'
import { probeVideoFile } from './probe'
import { computePlaybackSize } from './scale'
import { ffmpegBin, cwebpBin, runSpawn, SpawnFailedError, SpawnTimeoutError } from './spawn'
import { cleanupTempDir, createProcessTempDir } from './temp'

const MAX_ATTEMPTS = 2
const LEASE_MS = 120_000

const SAFE_ERROR: Record<string, string> = {
  MISSING_ORIGINAL: 'Orijinal dosya yok.',
  INVALID_MIME: 'Dosya türü işlenemez.',
  OVERSIZED_ASSET: 'Dosya boyutu limiti aşıldı.',
  FFPROBE_FAILED: 'Video metadata okunamadı.',
  FFMPEG_FAILED: 'Video dönüştürme başarısız.',
  TIMEOUT: 'İşleme zaman aşımına uğradı.',
  UPLOAD_FAILED: 'Depolama yüklemesi başarısız.',
  STORAGE_DOWNLOAD_FAILED: 'Orijinal dosya depolamadan alınamadı.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  POSTER_FAILED: 'Poster üretilemedi.',
}

function publicError(code: string): string {
  return SAFE_ERROR[code] ?? 'Video işleme başarısız.'
}

function failCode(err: unknown): string {
  if (err instanceof SpawnTimeoutError) return 'TIMEOUT'
  if (err instanceof SpawnFailedError) return err.code
  if (err instanceof Error && err.message && /^[A-Z_]+$/.test(err.message)) return err.message
  return 'FFMPEG_FAILED'
}

function retryable(code: string): boolean {
  return code === 'UPLOAD_FAILED' || code === 'STORAGE_DOWNLOAD_FAILED'
}

export type ProcessTickResult =
  | { outcome: 'IDLE' }
  | { outcome: 'SUCCEEDED'; jobId: string; itemId: string; posterFailed: boolean }
  | { outcome: 'FAILED'; jobId: string; itemId: string; code: string }
  | { outcome: 'REQUEUED'; jobId: string; itemId: string }

export type ProcessWorkerDeps = {
  store: VideoImportStore
  storage: VideoObjectStore
  workerId?: string
  now?: Date
  leaseMs?: number
  maxAttempts?: number
  timeoutMs?: number
  maxInputBytes?: number
  ffmpeg?: string
  run?: typeof runSpawn
}

export async function processOneProcessJob(deps: ProcessWorkerDeps): Promise<ProcessTickResult> {
  const now = deps.now ?? new Date()
  const workerId = deps.workerId ?? `vlw_proc_${now.getTime()}`
  const job = await deps.store.claimNextProcessJob({
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

  if (item.status === 'PLAYBACK_READY' && item.playbackStorageKey) {
    await succeedJob(deps.store, job, now, { idempotent: true })
    return { outcome: 'SUCCEEDED', jobId: job.id, itemId: item.id, posterFailed: false }
  }

  if (!item.originalStorageKey) {
    return finalizeFailure(deps, job, item.id, 'MISSING_ORIGINAL', now)
  }

  await deps.store.updateItem(item.id, {
    status: 'PROCESSING',
    lastProcessJobId: job.id,
    processErrorCode: null,
    processErrorMessage: null,
    updatedAt: now,
  })

  const timeoutMs = deps.timeoutMs ?? videoLibraryProcessTimeoutMs()
  const maxBytes = deps.maxInputBytes ?? videoLibraryMaxBytes()
  const spawnOpts = { timeoutMs, maxStderrBytes: MAX_STDERR_BYTES }
  const spawnRun = deps.run ?? runSpawn
  const ffmpeg = deps.ffmpeg ?? ffmpegBin()

  let tempDir: string | null = null
  const originalKey = item.originalStorageKey
  try {
    if (item.mimeType && !ALLOWED_ORIGINAL_MIME.has(item.mimeType)) {
      return finalizeFailure(deps, job, item.id, 'INVALID_MIME', now)
    }
    if (item.fileSizeBytes && item.fileSizeBytes > maxBytes) {
      return finalizeFailure(deps, job, item.id, 'OVERSIZED_ASSET', now)
    }

    tempDir = await createProcessTempDir(job.id)
    const originalPath = join(tempDir, 'original.bin')
    let originalBytes: Uint8Array
    try {
      originalBytes = await deps.storage.getBytes(originalKey)
    } catch {
      return finalizeFailure(deps, job, item.id, 'STORAGE_DOWNLOAD_FAILED', now)
    }
    if (originalBytes.byteLength > maxBytes) {
      return finalizeFailure(deps, job, item.id, 'OVERSIZED_ASSET', now)
    }
    await writeFile(originalPath, originalBytes)

    const probed = await probeVideoFile(originalPath, spawnOpts)
    const size = computePlaybackSize(probed.width, probed.height)
    const playbackPath = join(tempDir, '720p.mp4')
    const playbackArgs = buildPlaybackEncodeArgs({
      inputPath: originalPath,
      outputPath: playbackPath,
      size,
      hasAudio: probed.hasAudio,
    })
    const encoded = await spawnRun(ffmpeg, playbackArgs, spawnOpts)
    if (encoded.code !== 0) {
      throw new SpawnFailedError('FFMPEG_FAILED', encoded.stderr)
    }

    const playbackMeta = await probeVideoFile(playbackPath, spawnOpts)
    const playbackBody = await readFile(playbackPath)
    const playbackKey = buildVideoLibraryMediaKey({
      itemId: item.id,
      kind: 'playback',
      filename: '720p.mp4',
    })
    try {
      await deps.storage.upload(playbackKey, playbackBody, {
        contentType: PLAYBACK_MIME,
        cacheControl: 'public, max-age=31536000, immutable',
      })
    } catch {
      return finalizeFailure(deps, job, item.id, 'UPLOAD_FAILED', now)
    }

    let posterKey: string | null = null
    let posterFailed = false
    try {
      const posterPngPath = join(tempDir, 'poster.png')
      const posterPath = join(tempDir, 'poster.webp')
      const posterFrame = await spawnRun(
        ffmpeg,
        buildPosterPngArgs({
          inputPath: originalPath,
          outputPath: posterPngPath,
          durationSec: probed.durationSec,
        }),
        spawnOpts
      )
      if (posterFrame.code !== 0) throw new SpawnFailedError('POSTER_FAILED', posterFrame.stderr)
      const webpRun = await spawnRun(
        cwebpBin(),
        buildCwebpArgs({ inputPath: posterPngPath, outputPath: posterPath }),
        spawnOpts
      )
      if (webpRun.code !== 0) throw new SpawnFailedError('POSTER_FAILED', webpRun.stderr)
      const posterBody = await readFile(posterPath)
      posterKey = buildVideoLibraryMediaKey({
        itemId: item.id,
        kind: 'poster',
        filename: 'poster.webp',
      })
      await deps.storage.upload(posterKey, posterBody, {
        contentType: POSTER_MIME,
        cacheControl: 'public, max-age=31536000, immutable',
      })
    } catch {
      posterFailed = true
      posterKey = item.posterStorageKey
    }

    const stillOriginal = await deps.storage.exists(originalKey)
    if (!stillOriginal) {
      return finalizeFailure(deps, job, item.id, 'MISSING_ORIGINAL', now)
    }

    await deps.store.updateItem(item.id, {
      status: 'PLAYBACK_READY',
      originalStorageKey: originalKey,
      playbackStorageKey: playbackKey,
      posterStorageKey: posterKey,
      playbackMimeType: PLAYBACK_MIME,
      playbackFileSizeBytes: playbackBody.byteLength,
      width: playbackMeta.width,
      height: playbackMeta.height,
      durationMs: playbackMeta.durationMs || probed.durationMs,
      aspectRatio: playbackMeta.aspectRatio,
      videoCodec: playbackMeta.videoCodec,
      audioCodec: playbackMeta.audioCodec,
      fps: playbackMeta.fps,
      renditions: [
        {
          height: playbackMeta.height,
          storageKey: playbackKey,
          mimeType: PLAYBACK_MIME,
          fileSizeBytes: playbackBody.byteLength,
        },
      ],
      processErrorCode: posterFailed ? 'POSTER_FAILED' : null,
      processErrorMessage: posterFailed ? publicError('POSTER_FAILED') : null,
      lastProcessJobId: job.id,
      updatedAt: now,
    })
    await succeedJob(deps.store, job, now, {
      playbackStorageKey: playbackKey,
      posterStorageKey: posterKey,
      posterFailed,
      originalStorageKey: originalKey,
    })
    return { outcome: 'SUCCEEDED', jobId: job.id, itemId: item.id, posterFailed }
  } catch (err) {
    const code = failCode(err)
    return finalizeFailure(deps, job, item.id, code, now)
  } finally {
    await cleanupTempDir(tempDir)
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

async function finalizeFailure(
  deps: ProcessWorkerDeps,
  job: VideoImportJob,
  itemId: string,
  code: string,
  now: Date
): Promise<ProcessTickResult> {
  const result = await failJob(deps.store, job, code, now, deps.maxAttempts ?? MAX_ATTEMPTS)
  const existing = await deps.store.findItemById(itemId)
  const patch: Partial<VideoLibraryItem> = {
    status: result === 'REQUEUED' ? 'PROCESSING' : 'PROCESSING_FAILED',
    processErrorCode: code,
    processErrorMessage: publicError(code),
    lastProcessJobId: job.id,
    updatedAt: now,
  }
  if (existing?.originalStorageKey) patch.originalStorageKey = existing.originalStorageKey
  await deps.store.updateItem(itemId, patch)
  return { outcome: result, jobId: job.id, itemId, code }
}
