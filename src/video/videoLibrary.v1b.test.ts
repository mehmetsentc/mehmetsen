import { createHash } from 'node:crypto'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isVideoLibraryEnabled, isVideoLibraryImportEnabled } from '@/video/featureFlag'
import { detectVideoProvider } from '@/video/providers/registry'
import { parseDownloadUrl, isPrivateOrReservedIp, assertPublicDownloadUrl, UnsafeDownloadUrlError } from '@/video/security/ssrf'
import { resolveImportSource } from '@/video/importer/resolveSource'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { processOneImportJob } from '@/video/importer/worker'
import { createMemoryImportStore } from '@/video/importer/memoryStore'
import { downloadVideoFile, DownloadFailedError } from '@/video/importer/download'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'

function sampleItem(overrides: Partial<VideoLibraryItem> = {}): VideoLibraryItem {
  const now = new Date()
  return {
    id: newVideoLibraryId('vli'),
    platform: 'generic',
    platformVideoId: 'abc',
    originalUrl: 'https://cdn.example.com/clip.mp4',
    normalizedUrl: 'https://cdn.example.com/clip.mp4',
    sourceProfileId: null,
    sourceUsername: null,
    sourceName: null,
    sourceUrl: null,
    title: 'Clip',
    description: null,
    durationMs: 1000,
    width: null,
    height: null,
    aspectRatio: null,
    thumbnailUrl: null,
    posterStorageKey: null,
    originalStorageKey: null,
    playbackStorageKey: null,
    streamManifestKey: null,
    renditions: [],
    mimeType: null,
    fileSizeBytes: null,
    publishedAt: null,
    importedAt: null,
    publishedNewsId: null,
    status: 'INSPECTED',
    rightsStatus: 'UNKNOWN',
    contentHash: null,
    tags: [],
    importErrorCode: null,
    importErrorMessage: null,
    lastImportJobId: null,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('V1B flags', () => {
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of ['VIDEO_LIBRARY_ENABLED', 'VIDEO_LIBRARY_IMPORT_ENABLED', 'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED']) {
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
  it('import stays false even when library is on unless import env is set', () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    expect(isVideoLibraryEnabled()).toBe(true)
    expect(isVideoLibraryImportEnabled()).toBe(false)
    process.env.VIDEO_LIBRARY_IMPORT_ENABLED = 'true'
    expect(isVideoLibraryImportEnabled()).toBe(true)
  })
})

describe('V1B provider support', () => {
  it('normalizes supported YouTube URLs and extracts id', async () => {
    const p = detectVideoProvider('https://youtu.be/dQw4w9wgXcQ')
    expect(p.platform).toBe('youtube')
    expect(await p.normalizeUrl('https://www.youtube.com/watch?v=dQw4w9wgXcQ&utm_source=x')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ'
    )
  })
  it('rejects youtube as a download source', () => {
    const source = resolveImportSource(
      sampleItem({
        platform: 'youtube',
        originalUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
        normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      })
    )
    expect(source.ok).toBe(false)
    if (source.ok) throw new Error('expected fail')
    expect(source.code).toBe('YOUTUBE_NOT_DIRECT_MEDIA')
  })
  it('accepts generic direct mp4', () => {
    const source = resolveImportSource(sampleItem())
    expect(source.ok).toBe(true)
  })
  it('marks unsupported platforms as metadata-only', () => {
    expect(resolveImportSource(sampleItem({ platform: 'instagram' })).ok).toBe(false)
    expect(detectVideoProvider('not-a-url').platform).toBe('generic')
  })
})

describe('V1B SSRF', () => {
  it('rejects localhost, private IP, and non-http protocols', () => {
    expect(() => parseDownloadUrl('http://localhost/video.mp4')).toThrow(UnsafeDownloadUrlError)
    expect(() => parseDownloadUrl('http://127.0.0.1/v.mp4')).toThrow(UnsafeDownloadUrlError)
    expect(() => parseDownloadUrl('file:///etc/passwd')).toThrow(UnsafeDownloadUrlError)
    expect(() => parseDownloadUrl('ftp://example.com/a.mp4')).toThrow(UnsafeDownloadUrlError)
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
  })
  it('rejects DNS that resolves to a private IP', async () => {
    await expect(
      assertPublicDownloadUrl('https://evil.example/v.mp4', async () => ({ address: '127.0.0.1', family: 4 }))
    ).rejects.toMatchObject({ code: 'PRIVATE_IP' })
  })
})

describe('V1B download size/mime', () => {
  it('prechecks content-length', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '999999999' } })) as typeof fetch
    await expect(
      downloadVideoFile({
        url: 'https://cdn.example.com/clip.mp4',
        suggestedExt: 'mp4',
        maxBytes: 100,
        fetchImpl,
        lookup: async () => ({ address: '1.1.1.1', family: 4 }),
      })
    ).rejects.toBeInstanceOf(DownloadFailedError)
  })
})

describe('V1B jobs + hash dedup + storage', () => {
  it('enqueues once and rejects duplicate active DOWNLOAD jobs', async () => {
    const item = sampleItem()
    const store = createMemoryImportStore([item])
    const first = await enqueueDownloadJob(item.id, store)
    expect(first.outcome).toBe('QUEUED')
    const second = await enqueueDownloadJob(item.id, store)
    expect(second.outcome).toBe('ALREADY_QUEUED')
    expect(store.jobs).toHaveLength(1)
    if (first.outcome !== 'QUEUED') throw new Error('queued')
    expect(first.item.status).toBe('PENDING_IMPORT')
  })

  it('runs success, failure, retry, and content-hash reuse without a second upload', async () => {
    const a = sampleItem({ id: 'vli_a' })
    const b = sampleItem({
      id: 'vli_b',
      originalUrl: 'https://cdn.example.com/copy.mp4',
      normalizedUrl: 'https://cdn.example.com/copy.mp4',
      platformVideoId: 'copy',
    })
    const store = createMemoryImportStore([a, b])
    const uploads: string[] = []
    const storage = {
      async upload(key: string) {
        uploads.push(key)
        return { key, url: `https://r2.test/${key}` }
      },
    }
    const bytes = Buffer.from('fake-mp4-bytes')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const download = async () => ({
      tempPath: '/tmp/does-not-need-to-exist-on-hash-path',
      mimeType: 'video/mp4',
      fileSizeBytes: bytes.length,
      contentHash: hash,
      ext: 'mp4',
    })

    await enqueueDownloadJob(a.id, store)
    const first = await processOneImportJob({
      store,
      storage: {
        async upload(key: string) {
          uploads.push(key)
          return { key, url: `https://r2.test/${key}` }
        },
      },
      download: async () => {
        const { writeFile, mkdir } = await import('node:fs/promises')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        const p = join(tmpdir(), `vl-test-${Date.now()}.mp4`)
        await mkdir(tmpdir(), { recursive: true })
        await writeFile(p, bytes)
        return {
          tempPath: p,
          mimeType: 'video/mp4',
          fileSizeBytes: bytes.length,
          contentHash: hash,
          ext: 'mp4',
        }
      },
    })
    expect(first.outcome).toBe('SUCCEEDED')
    expect(uploads).toHaveLength(1)

    await enqueueDownloadJob(b.id, store)
    const second = await processOneImportJob({
      store,
      storage,
      download: async () => {
        const { writeFile } = await import('node:fs/promises')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        const p = join(tmpdir(), `vl-test-b-${Date.now()}.mp4`)
        await writeFile(p, bytes)
        return {
          tempPath: p,
          mimeType: 'video/mp4',
          fileSizeBytes: bytes.length,
          contentHash: hash,
          ext: 'mp4',
        }
      },
    })
    expect(second.outcome).toBe('SUCCEEDED')
    if (second.outcome !== 'SUCCEEDED') throw new Error('succ')
    expect(second.deduped).toBe(true)
    expect(uploads).toHaveLength(1)
    expect(store.items.find((i) => i.id === 'vli_b')?.originalStorageKey).toBe(
      store.items.find((i) => i.id === 'vli_a')?.originalStorageKey
    )
  })

  it('retries retryable failures then marks FAILED', async () => {
    const item = sampleItem({ id: 'vli_fail' })
    const store = createMemoryImportStore([item])
    await enqueueDownloadJob(item.id, store)
    const storage = {
      async upload() {
        throw new Error('UPLOAD_FAILED')
      },
    }
    const download = async () => {
      const { writeFile } = await import('node:fs/promises')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const p = join(tmpdir(), `vl-fail-${Math.random()}.mp4`)
      await writeFile(p, 'x')
      return {
        tempPath: p,
        mimeType: 'video/mp4',
        fileSizeBytes: 1,
        contentHash: 'aa',
        ext: 'mp4',
      }
    }
    const r1 = await processOneImportJob({ store, storage, download, maxAttempts: 2 })
    expect(r1.outcome).toBe('REQUEUED')
    const later = new Date(Date.now() + 10_000)
    const r2 = await processOneImportJob({ store, storage, download, maxAttempts: 2, now: later })
    expect(r2.outcome).toBe('FAILED')
    expect(store.items[0].status).toBe('FAILED')
    expect(store.items[0].importErrorCode).toBe('UPLOAD_FAILED')
    expect(store.items[0].rightsStatus).toBe('UNKNOWN')
  })

  it('fails youtube import without creating R2 objects', async () => {
    const item = sampleItem({
      platform: 'youtube',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
    })
    const store = createMemoryImportStore([item])
    await enqueueDownloadJob(item.id, store)
    const uploads: string[] = []
    const result = await processOneImportJob({
      store,
      storage: {
        async upload(key: string) {
          uploads.push(key)
          return { key, url: key }
        },
      },
    })
    expect(result.outcome).toBe('FAILED')
    expect(uploads).toHaveLength(0)
    expect(store.items[0].status).toBe('FAILED')
  })
})
