import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isVideoLibraryEnabled, isVideoLibraryProcessEnabled } from '@/video/featureFlag'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'
import { createMemoryImportStore } from '@/video/importer/memoryStore'
import { enqueueProcessJob } from '@/video/processing/enqueue'
import { processOneProcessJob } from '@/video/processing/worker'
import { createMemoryVideoObjectStore } from '@/video/processing/objectStore'
import { computePlaybackSize, formatAspectRatio } from '@/video/processing/scale'
import { selectPosterTimestampSec } from '@/video/processing/posterFrame'
import { buildPlaybackEncodeArgs, buildPosterPngArgs, buildCwebpArgs, assertArgsAreArgv } from '@/video/processing/encodeArgs'
import { ffmpegBin, ffprobeBin, runSpawn, SpawnTimeoutError } from '@/video/processing/spawn'
import { probeVideoFile } from '@/video/processing/probe'
import { observeHttpRange, serveFileWithRange } from '@/video/processing/httpRange'

function sampleReadyItem(overrides: Partial<VideoLibraryItem> = {}): VideoLibraryItem {
  const now = new Date()
  return {
    id: newVideoLibraryId('vli'),
    platform: 'generic',
    platformVideoId: 'clip',
    originalUrl: 'https://cdn.example.com/clip.mp4',
    normalizedUrl: 'https://cdn.example.com/clip.mp4',
    sourceProfileId: null,
    sourceUsername: null,
    sourceName: null,
    sourceUrl: null,
    title: 'Clip; rm -rf /',
    description: null,
    durationMs: 1000,
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    thumbnailUrl: null,
    posterStorageKey: null,
    originalStorageKey: 'video-library/vli_x/original/original.mp4',
    playbackStorageKey: null,
    streamManifestKey: null,
    renditions: [],
    mimeType: 'video/mp4',
    fileSizeBytes: 1000,
    playbackMimeType: null,
    playbackFileSizeBytes: null,
    videoCodec: null,
    audioCodec: null,
    fps: null,
    publishedAt: null,
    importedAt: now,
    publishedNewsId: null,
    status: 'READY',
    rightsStatus: 'UNKNOWN',
    contentHash: 'abc',
    tags: [],
    importErrorCode: null,
    importErrorMessage: null,
    lastImportJobId: null,
    processErrorCode: null,
    processErrorMessage: null,
    lastProcessJobId: null,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

async function makeTestMp4(opts: { width: number; height: number; seconds?: number }): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'vl-v1c-src-'))
  const out = join(dir, 'src.mp4')
  const seconds = opts.seconds ?? 1
  const args = [
    '-hide_banner',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${opts.width}x${opts.height}:rate=25`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-t',
    String(seconds),
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    out,
  ]
  const result = await runSpawn(ffmpegBin(), args, { timeoutMs: 30_000 })
  if (result.code !== 0) {
    await rm(dir, { recursive: true, force: true })
    throw new Error(result.stderr || 'ffmpeg fixture failed')
  }
  const body = await readFile(out)
  await rm(dir, { recursive: true, force: true })
  return body
}

describe('V1C flags', () => {
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of ['VIDEO_LIBRARY_ENABLED', 'VIDEO_LIBRARY_PROCESS_ENABLED', 'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED']) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })
  it('process stays false unless library + process env are on', () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    expect(isVideoLibraryEnabled()).toBe(true)
    expect(isVideoLibraryProcessEnabled()).toBe(false)
    process.env.VIDEO_LIBRARY_PROCESS_ENABLED = 'true'
    expect(isVideoLibraryProcessEnabled()).toBe(true)
  })
})

describe('V1C scale + poster + spawn args', () => {
  it('does not upscale under-720p and keeps orientation', () => {
    expect(computePlaybackSize(640, 360)).toEqual({ width: 640, height: 360, upscaled: false })
    expect(computePlaybackSize(1920, 1080)).toEqual({ width: 1280, height: 720, upscaled: false })
    const vertical = computePlaybackSize(1080, 1920)
    expect(vertical.width).toBe(720)
    expect(vertical.height).toBe(1280)
    expect(vertical.height).toBeGreaterThan(vertical.width)
    expect(formatAspectRatio(1080, 1920)).toBe('9:16')
  })

  it('does not pick 0.00s for typical durations', () => {
    expect(selectPosterTimestampSec(8)).toBeGreaterThan(0)
    expect(selectPosterTimestampSec(8)).toBeLessThanOrEqual(3)
  })

  it('builds argv spawn args without user title/url interpolation', () => {
    const args = buildPlaybackEncodeArgs({
      inputPath: '/tmp/vl-in.mp4',
      outputPath: '/tmp/vl-out.mp4',
      size: { width: 1280, height: 720, upscaled: false },
      hasAudio: true,
    })
    assertArgsAreArgv(args)
    expect(args).toContain('+faststart')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args).toContain('yuv420p')
    expect(args.join(' ')).not.toContain('rm -rf')
    expect(args.join(' ')).not.toContain('cdn.example.com')
    const poster = buildPosterPngArgs({
      inputPath: '/tmp/vl-in.mp4',
      outputPath: '/tmp/poster.png',
      durationSec: 10,
    })
    expect(poster.includes('-ss')).toBe(true)
    expect(poster[poster.indexOf('-ss') + 1]).not.toBe('0')
    expect(poster.join(' ')).not.toContain('libwebp')
    const webp = buildCwebpArgs({ inputPath: '/tmp/poster.png', outputPath: '/tmp/poster.webp' })
    expect(webp).toContain('-o')
    expect(webp).toContain('/tmp/poster.webp')
  })
})

describe('V1C process jobs', () => {
  it('enqueues PROCESS once and rejects a duplicate active job', async () => {
    const item = sampleReadyItem()
    const store = createMemoryImportStore([item])
    const first = await enqueueProcessJob(item.id, store)
    expect(first.outcome).toBe('QUEUED')
    if (first.outcome !== 'QUEUED') throw new Error('queued')
    expect(first.item.status).toBe('PROCESSING')
    const second = await enqueueProcessJob(item.id, store)
    expect(second.outcome).toBe('ALREADY_QUEUED')
    expect(store.jobs.filter((j) => j.kind === 'PROCESS')).toHaveLength(1)
  })

  it('is idempotent when playback is already ready', async () => {
    const item = sampleReadyItem({
      status: 'PLAYBACK_READY',
      playbackStorageKey: 'video-library/x/playback/720p.mp4',
    })
    const store = createMemoryImportStore([item])
    const result = await enqueueProcessJob(item.id, store)
    expect(result.outcome).toBe('ALREADY_PROCESSED')
    expect(store.jobs).toHaveLength(0)
  })

  it('rejects missing original at enqueue', async () => {
    const item = sampleReadyItem({ originalStorageKey: null })
    const store = createMemoryImportStore([item])
    await expect(enqueueProcessJob(item.id, store)).rejects.toThrow('MISSING_ORIGINAL')
  })

  it('fails invalid MIME and oversized assets without touching original', async () => {
    const originalKey = 'video-library/vli_bad/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_bad',
      originalStorageKey: originalKey,
      mimeType: 'application/pdf',
    })
    const store = createMemoryImportStore([item])
    const storage = createMemoryVideoObjectStore()
    await storage.upload(originalKey, Buffer.from('not-a-video'))
    await enqueueProcessJob(item.id, store)
    const result = await processOneProcessJob({ store, storage, maxAttempts: 1 })
    expect(result.outcome).toBe('FAILED')
    if (result.outcome !== 'FAILED') throw new Error('failed')
    expect(result.code).toBe('INVALID_MIME')
    expect(store.items[0].status).toBe('PROCESSING_FAILED')
    expect(store.items[0].originalStorageKey).toBe(originalKey)
    expect(await storage.exists(originalKey)).toBe(true)

    const big = sampleReadyItem({
      id: 'vli_big',
      originalStorageKey: originalKey,
      mimeType: 'video/mp4',
      fileSizeBytes: 50,
    })
    const store2 = createMemoryImportStore([big])
    await enqueueProcessJob(big.id, store2)
    const oversized = await processOneProcessJob({
      store: store2,
      storage,
      maxAttempts: 1,
      maxInputBytes: 10,
    })
    expect(oversized.outcome).toBe('FAILED')
    if (oversized.outcome !== 'FAILED') throw new Error('os')
    expect(oversized.code).toBe('OVERSIZED_ASSET')
    expect(store2.items[0].originalStorageKey).toBe(originalKey)
  })

  it('records ffmpeg failure and timeout as PROCESSING_FAILED', async () => {
    const bytes = await makeTestMp4({ width: 640, height: 360 })
    const originalKey = 'video-library/vli_ff/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_ff',
      originalStorageKey: originalKey,
      fileSizeBytes: bytes.byteLength,
    })
    const store = createMemoryImportStore([item])
    const storage = createMemoryVideoObjectStore()
    await storage.upload(originalKey, bytes)
    await enqueueProcessJob(item.id, store)
    const failed = await processOneProcessJob({
      store,
      storage,
      maxAttempts: 1,
      run: async () => ({ stdout: '', stderr: 'boom', code: 1 }),
    })
    expect(failed.outcome).toBe('FAILED')
    if (failed.outcome !== 'FAILED') throw new Error('ff')
    expect(failed.code).toBe('FFMPEG_FAILED')
    expect(store.items[0].status).toBe('PROCESSING_FAILED')
    expect(await storage.exists(originalKey)).toBe(true)

    const item2 = sampleReadyItem({
      id: 'vli_to',
      originalStorageKey: originalKey,
      fileSizeBytes: bytes.byteLength,
    })
    const store3 = createMemoryImportStore([item2])
    await enqueueProcessJob(item2.id, store3)
    const timed = await processOneProcessJob({
      store: store3,
      storage,
      maxAttempts: 1,
      run: async () => {
        throw new SpawnTimeoutError()
      },
    })
    expect(timed.outcome).toBe('FAILED')
    if (timed.outcome !== 'FAILED') throw new Error('to')
    expect(timed.code).toBe('TIMEOUT')
    expect(store3.items[0].originalStorageKey).toBe(originalKey)
  })

  it('uploads playback and poster, keeps original, and cleans temp', async () => {
    const bytes = await makeTestMp4({ width: 1280, height: 720 })
    const originalKey = 'video-library/vli_ok/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_ok',
      originalStorageKey: originalKey,
      fileSizeBytes: bytes.byteLength,
    })
    const store = createMemoryImportStore([item])
    const storage = createMemoryVideoObjectStore()
    await storage.upload(originalKey, bytes)
    await enqueueProcessJob(item.id, store)
    const result = await processOneProcessJob({ store, storage, maxAttempts: 1, timeoutMs: 60_000 })
    expect(result.outcome).toBe('SUCCEEDED')
    const ready = store.items[0]
    expect(ready.status).toBe('PLAYBACK_READY')
    expect(ready.originalStorageKey).toBe(originalKey)
    expect(ready.playbackStorageKey).toBe('video-library/vli_ok/playback/720p.mp4')
    expect(ready.posterStorageKey).toBe('video-library/vli_ok/poster/poster.webp')
    expect(ready.playbackMimeType).toBe('video/mp4')
    expect(ready.videoCodec).toBe('h264')
    expect(ready.audioCodec).toBe('aac')
    expect(ready.width).toBe(1280)
    expect(ready.height).toBe(720)
    expect(Buffer.compare(Buffer.from(await storage.getBytes(originalKey)), bytes)).toBe(0)
    expect(await storage.exists(ready.playbackStorageKey!)).toBe(true)
    expect(await storage.exists(ready.posterStorageKey!)).toBe(true)
    const playback = Buffer.from(await storage.getBytes(ready.playbackStorageKey!))
    const ftyp = playback.indexOf(Buffer.from('ftyp'))
    const moov = playback.indexOf(Buffer.from('moov'))
    const mdat = playback.indexOf(Buffer.from('mdat'))
    expect(ftyp).toBeGreaterThanOrEqual(0)
    expect(moov).toBeGreaterThanOrEqual(0)
    expect(mdat).toBeGreaterThan(moov)
    await expect(stat(join(tmpdir(), `vl-process-${store.jobs[0].id}`))).rejects.toThrow()
  }, 60_000)

  it('keeps vertical video vertical and does not upscale 360p', async () => {
    const verticalBytes = await makeTestMp4({ width: 1080, height: 1920 })
    const originalKey = 'video-library/vli_vert/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_vert',
      originalStorageKey: originalKey,
      fileSizeBytes: verticalBytes.byteLength,
      width: 1080,
      height: 1920,
    })
    const store = createMemoryImportStore([item])
    const storage = createMemoryVideoObjectStore()
    await storage.upload(originalKey, verticalBytes)
    await enqueueProcessJob(item.id, store)
    const result = await processOneProcessJob({ store, storage, maxAttempts: 1, timeoutMs: 60_000 })
    expect(result.outcome).toBe('SUCCEEDED')
    expect(store.items[0].width).toBe(720)
    expect(store.items[0].height).toBe(1280)
    expect(store.items[0].aspectRatio).toBe('9:16')

    const smallBytes = await makeTestMp4({ width: 640, height: 360 })
    const smallKey = 'video-library/vli_small/original/original.mp4'
    const small = sampleReadyItem({
      id: 'vli_small',
      originalStorageKey: smallKey,
      fileSizeBytes: smallBytes.byteLength,
    })
    const store2 = createMemoryImportStore([small])
    await storage.upload(smallKey, smallBytes)
    await enqueueProcessJob(small.id, store2)
    const smallResult = await processOneProcessJob({
      store: store2,
      storage,
      maxAttempts: 1,
      timeoutMs: 60_000,
    })
    expect(smallResult.outcome).toBe('SUCCEEDED')
    expect(store2.items[0].width).toBe(640)
    expect(store2.items[0].height).toBe(360)
  }, 90_000)

  it('does not fail the original when poster generation fails', async () => {
    const bytes = await makeTestMp4({ width: 640, height: 360 })
    const originalKey = 'video-library/vli_poster/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_poster',
      originalStorageKey: originalKey,
      fileSizeBytes: bytes.byteLength,
    })
    const store = createMemoryImportStore([item])
    const storage = createMemoryVideoObjectStore()
    await storage.upload(originalKey, bytes)
    await enqueueProcessJob(item.id, store)
    const result = await processOneProcessJob({
      store,
      storage,
      maxAttempts: 1,
      timeoutMs: 60_000,
      run: async (bin, args, opts) => {
        if (args.some((a) => a.endsWith('.webp'))) return { stdout: '', stderr: 'poster boom', code: 1 }
        return runSpawn(bin, args, opts)
      },
    })
    expect(result.outcome).toBe('SUCCEEDED')
    if (result.outcome !== 'SUCCEEDED') throw new Error('succ')
    expect(result.posterFailed).toBe(true)
    expect(store.items[0].status).toBe('PLAYBACK_READY')
    expect(store.items[0].playbackStorageKey).toBeTruthy()
    expect(store.items[0].originalStorageKey).toBe(originalKey)
    expect(await storage.exists(originalKey)).toBe(true)
  }, 60_000)

  it('fails playback upload without deleting original', async () => {
    const bytes = await makeTestMp4({ width: 640, height: 360 })
    const originalKey = 'video-library/vli_up/original/original.mp4'
    const item = sampleReadyItem({
      id: 'vli_up',
      originalStorageKey: originalKey,
      fileSizeBytes: bytes.byteLength,
    })
    const store = createMemoryImportStore([item])
    const inner = createMemoryVideoObjectStore()
    await inner.upload(originalKey, bytes)
    await enqueueProcessJob(item.id, store)
    const result = await processOneProcessJob({
      store,
      storage: {
        ...inner,
        async upload(key, body, options) {
          if (key.includes('/playback/')) throw new Error('UPLOAD_FAILED')
          return inner.upload(key, body, options)
        },
      },
      maxAttempts: 1,
      timeoutMs: 60_000,
    })
    expect(result.outcome).toBe('FAILED')
    if (result.outcome !== 'FAILED') throw new Error('up')
    expect(result.code).toBe('UPLOAD_FAILED')
    expect(store.items[0].originalStorageKey).toBe(originalKey)
    expect(await inner.exists(originalKey)).toBe(true)
  }, 60_000)
})

describe('V1C HTTP range (local playback file)', () => {
  it('serves Accept-Ranges and 206 for playback MP4', async () => {
    const bytes = await makeTestMp4({ width: 640, height: 360 })
    const dir = await mkdtemp(join(tmpdir(), 'vl-range-'))
    const file = join(dir, '720p.mp4')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, bytes)
    const server = await serveFileWithRange(file, 'video/mp4')
    try {
      const observed = await observeHttpRange(server.url)
      expect(observed.head.acceptRanges?.toLowerCase()).toContain('bytes')
      expect(observed.head.contentType).toContain('video/mp4')
      expect(observed.rangedGet.status).toBe(206)
      expect(observed.rangedGet.contentRange).toMatch(/^bytes 0-1023\//)
      expect(observed.rangedGet.bodyBytes).toBe(1024)
      const probed = await probeVideoFile(file, { timeoutMs: 10_000 }, ffprobeBin())
      expect(probed.videoCodec).toBe('h264')
    } finally {
      await server.close()
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
