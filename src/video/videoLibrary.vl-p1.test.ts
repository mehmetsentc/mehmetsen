import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { matchesDedupKeys } from '@/video/domain/dedup'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'
import { parseBulkVideoUrls } from '@/video/library/parseBulkUrls'
import { inspectBulkVideoUrls } from '@/video/library/inspectBulk'
import { enqueueSelectedVideoUrls } from '@/video/library/enqueueSelected'
import { inspectVideoUrl } from '@/video/library/inspect'
import { parseVideoLibraryAction, videoLibraryActionPermission } from '@/video/library/auth'
import type { VideoLibraryRepository } from '@/video/library/types'
import { detectVideoProvider } from '@/video/providers/registry'
import { resolveImportSource } from '@/video/importer/resolveSource'
import { createMemoryImportStore } from '@/video/importer/memoryStore'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { processOneImportJob } from '@/video/importer/worker'
import {
  parseDownloadUrl,
  isPrivateOrReservedIp,
  assertPublicDownloadUrl,
  UnsafeDownloadUrlError,
} from '@/video/security/ssrf'
import { downloadVideoFile, DownloadFailedError } from '@/video/importer/download'
import { isVideoLibraryEnabled, isVideoLibraryImportEnabled, isVideoLibraryProcessEnabled, isVideoLibraryOneShotValidationEnabled } from '@/video/featureFlag'
import { GET as libraryGET } from '@/app/api/admin/videos/library/route'

function memoryRepo(): VideoLibraryRepository & { items: VideoLibraryItem[]; inserts: number } {
  const items: VideoLibraryItem[] = []
  return {
    items,
    inserts: 0,
    async findByDedup(keys) {
      return items.find((item) => matchesDedupKeys(item, keys)) ?? null
    },
    async insertInspected({ metadata, createdBy }) {
      this.inserts += 1
      const now = new Date()
      const item: VideoLibraryItem = {
        id: newVideoLibraryId('vli'),
        platform: metadata.platform,
        platformVideoId: metadata.platformVideoId,
        originalUrl: metadata.originalUrl,
        normalizedUrl: metadata.normalizedUrl,
        sourceProfileId: metadata.source.sourceProfileId,
        sourceUsername: metadata.source.sourceUsername,
        sourceName: metadata.source.sourceName,
        sourceUrl: metadata.source.sourceUrl,
        title: metadata.title ?? '',
        description: metadata.description,
        durationMs: metadata.durationMs,
        width: metadata.width,
        height: metadata.height,
        aspectRatio: metadata.aspectRatio,
        thumbnailUrl: metadata.thumbnailUrl,
        posterStorageKey: null,
        originalStorageKey: null,
        playbackStorageKey: null,
        streamManifestKey: null,
        renditions: [],
        mimeType: null,
        fileSizeBytes: null,
        publishedAt: metadata.publishedAt,
        importedAt: null,
        publishedNewsId: null,
        status: 'INSPECTED',
        rightsStatus: 'UNKNOWN',
        contentHash: null,
        tags: [],
        importErrorCode: null,
        importErrorMessage: null,
        lastImportJobId: null,
        processErrorCode: null,
        processErrorMessage: null,
        lastProcessJobId: null,
        playbackMimeType: null,
        playbackFileSizeBytes: null,
        videoCodec: null,
        audioCodec: null,
        fps: null,
        createdBy,
        updatedBy: createdBy,
        createdAt: now,
        updatedAt: now,
      }
      items.push(item)
      return item
    },
    async list() {
      return { items: [...items], total: items.length }
    },
  }
}

describe('VL-P1 flags stay off', () => {
  const keys = [
    'VIDEO_LIBRARY_ENABLED',
    'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED',
    'VIDEO_LIBRARY_IMPORT_ENABLED',
    'VIDEO_LIBRARY_PROCESS_ENABLED',
    'VIDEO_LIBRARY_ONE_SHOT_VALIDATION_ENABLED',
  ]
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of keys) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })
  it('defaults all library flags to false', () => {
    expect(isVideoLibraryEnabled()).toBe(false)
    expect(isVideoLibraryImportEnabled()).toBe(false)
    expect(isVideoLibraryProcessEnabled()).toBe(false)
    expect(isVideoLibraryOneShotValidationEnabled()).toBe(false)
  })

  it('API stays 404 while the product flag is off', async () => {
    const res = await libraryGET(new Request('http://localhost/api/admin/videos/library'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('VIDEO_LIBRARY_DISABLED')
  })

  it('API requires auth when the library flag is on', async () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    const res = await libraryGET(new Request('http://localhost/api/admin/videos/library'))
    expect(res.status).toBe(401)
  })
})

describe('VL-P1 bulk parse', () => {
  it('drops blanks and collapses repeated pasted lines', () => {
    const parsed = parseBulkVideoUrls(
      '\nhttps://cdn.example.com/a.mp4\n\nhttps://cdn.example.com/a.mp4\n https://cdn.example.com/b.webm \n'
    )
    expect(parsed.unique).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.webm',
    ])
    expect(parsed.duplicates).toEqual(['https://cdn.example.com/a.mp4'])
    expect(parsed.blankSkipped).toBeGreaterThanOrEqual(2)
  })
})

describe('VL-P1 single URL inspect', () => {
  it('inspects direct mp4/webm without download capability false positives', async () => {
    const repo = memoryRepo()
    const mp4 = await inspectVideoUrl('https://cdn.example.com/clip.mp4', repo)
    expect(mp4.metadata.platform).toBe('generic')
    expect(resolveImportSource({
      platform: mp4.metadata.platform,
      originalUrl: mp4.metadata.originalUrl,
      normalizedUrl: mp4.metadata.normalizedUrl,
    }).ok).toBe(true)
    const webm = await inspectVideoUrl('https://cdn.example.com/clip.webm', repo)
    expect(resolveImportSource({
      platform: webm.metadata.platform,
      originalUrl: webm.metadata.originalUrl,
      normalizedUrl: webm.metadata.normalizedUrl,
    }).ok).toBe(true)
  })

  it('rejects invalid URL', async () => {
    await expect(inspectVideoUrl('not a valid url', memoryRepo())).rejects.toThrow('INVALID_URL')
  })

  it('detects social platforms as inspect-only', () => {
    expect(detectVideoProvider('https://www.youtube.com/watch?v=dQw4w9wgXcQ').platform).toBe('youtube')
    expect(detectVideoProvider('https://www.tiktok.com/@user/video/1234567890123456789').platform).toBe('tiktok')
    expect(detectVideoProvider('https://www.instagram.com/reel/AbC123xyz/').platform).toBe('instagram')
    expect(detectVideoProvider('https://x.com/user/status/1234567890123456789').platform).toBe('x')
    expect(detectVideoProvider('https://www.facebook.com/watch/?v=123456789').platform).toBe('facebook')
    expect(resolveImportSource({
      platform: 'youtube',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
    })).toMatchObject({ ok: false, code: 'YOUTUBE_NOT_DIRECT_MEDIA' })
    expect(resolveImportSource({
      platform: 'tiktok',
      originalUrl: 'https://www.tiktok.com/@user/video/1',
      normalizedUrl: 'https://www.tiktok.com/@user/video/1',
    })).toMatchObject({ ok: false, code: 'PLATFORM_METADATA_ONLY' })
  })
})

describe('VL-P1 bulk inspect never downloads', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('inspect must not download')
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('inspects 10 mixed lines, collapses repeats, and never inserts', async () => {
    const repo = memoryRepo()
    const text = [
      'https://cdn.example.com/a.mp4',
      '',
      'https://cdn.example.com/b.webm',
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/c.mov',
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      'https://www.tiktok.com/@user/video/1234567890123456789',
      'https://www.instagram.com/reel/AbC123xyz/',
      'https://x.com/user/status/1234567890123456789',
      'https://www.facebook.com/watch/?v=123456789',
      'not a valid url',
      'https://cdn.example.com/d.m4v',
    ].join('\n')

    const result = await inspectBulkVideoUrls(text, {
      ...repo,
      async insertInspected() {
        throw new Error('insert must not run on inspect')
      },
    })

    expect(result.blankSkipped).toBeGreaterThanOrEqual(1)
    expect(result.duplicateLines).toBe(1)
    expect(result.rows).toHaveLength(10)
    expect(repo.inserts).toBe(0)
    const mp4 = result.rows.find((r) => r.originalUrl.endsWith('a.mp4'))
    expect(mp4?.downloadable).toBe(true)
    const youtube = result.rows.find((r) => r.platform === 'youtube')
    expect(youtube?.downloadable).toBe(false)
    expect(youtube?.downloadCode).toBe('YOUTUBE_NOT_DIRECT_MEDIA')
    const invalid = result.rows.find((r) => r.originalUrl === 'not a valid url')
    expect(invalid?.error).toBe('INVALID_URL')
    expect(result.rows.filter((r) => r.downloadable)).toHaveLength(4)
  })
})

describe('VL-P1 enqueue selected only', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('oembed')) {
          return new Response(JSON.stringify({ title: 'YouTube' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        throw new Error('download must not run during enqueue')
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('throws on zero selection', async () => {
    await expect(
      enqueueSelectedVideoUrls([], 'admin', memoryRepo(), createMemoryImportStore())
    ).rejects.toThrow('ZERO_SELECTION')
  })

  it('queues only the selected supported subset', async () => {
    const repo = memoryRepo()
    const store = createMemoryImportStore(repo.items)
    const result = await enqueueSelectedVideoUrls(
      [
        'https://cdn.example.com/keep.mp4',
        'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      ],
      'admin',
      repo,
      store
    )
    expect(result.selected).toBe(2)
    expect(result.queued).toBe(1)
    expect(result.rows.find((r) => r.url.includes('youtube'))?.outcome).toBe('SKIPPED')
    expect(result.rows.find((r) => r.url.includes('youtube'))?.reason).toBe('YOUTUBE_NOT_DIRECT_MEDIA')
    expect(store.jobs).toHaveLength(1)
    expect(store.jobs[0].status).toBe('QUEUED')
    expect(repo.items.every((item) => item.rightsStatus === 'UNKNOWN')).toBe(true)
  })
})

describe('VL-P1 auth mapping', () => {
  it('maps inspect to read and enqueue to create', () => {
    expect(videoLibraryActionPermission('inspect')).toBe('video:read')
    expect(videoLibraryActionPermission('inspect-bulk')).toBe('video:read')
    expect(videoLibraryActionPermission('jobs')).toBe('video:read')
    expect(videoLibraryActionPermission('import-selected')).toBe('video:create')
    expect(videoLibraryActionPermission('import')).toBe('video:create')
    expect(parseVideoLibraryAction('inspect-bulk')).toBe('inspect-bulk')
    expect(parseVideoLibraryAction(undefined)).toBe('inspect')
  })
})

describe('VL-P1 security extras', () => {
  it('blocks private IPv6, metadata, and .local hosts', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(() => parseDownloadUrl('http://[::1]/v.mp4')).toThrow(UnsafeDownloadUrlError)
    expect(() => parseDownloadUrl('http://nas.local/v.mp4')).toThrow(UnsafeDownloadUrlError)
  })

  it('rejects DNS rebinding to metadata IP', async () => {
    await expect(
      assertPublicDownloadUrl('https://evil.example/v.mp4', async () => ({
        address: '169.254.169.254',
        family: 4,
      }))
    ).rejects.toMatchObject({ code: 'PRIVATE_IP' })
  })

  it('rejects redirect overflow, invalid MIME, and oversized files', async () => {
    const lookup = async () => ({ address: '1.1.1.1', family: 4 })
    let hops = 0
    const redirectFetch = (async () => {
      hops += 1
      return new Response(null, {
        status: 302,
        headers: { location: `https://cdn.example.com/hop-${hops}.mp4` },
      })
    }) as typeof fetch
    await expect(
      downloadVideoFile({
        url: 'https://cdn.example.com/clip.mp4',
        suggestedExt: 'mp4',
        maxRedirects: 3,
        fetchImpl: redirectFetch,
        lookup,
      })
    ).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' })

    await expect(
      downloadVideoFile({
        url: 'https://cdn.example.com/clip.mp4',
        suggestedExt: 'mp4',
        fetchImpl: (async () =>
          new Response('nope', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch,
        lookup,
      })
    ).rejects.toBeInstanceOf(DownloadFailedError)

    await expect(
      downloadVideoFile({
        url: 'https://cdn.example.com/clip.mp4',
        suggestedExt: 'mp4',
        maxBytes: 10,
        fetchImpl: (async () =>
          new Response(null, {
            status: 200,
            headers: { 'content-type': 'video/mp4', 'content-length': '999' },
          })) as typeof fetch,
        lookup,
      })
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('times out hung downloads', async () => {
    const lookup = async () => ({ address: '1.1.1.1', family: 4 })
    await expect(
      downloadVideoFile({
        url: 'https://cdn.example.com/clip.mp4',
        suggestedExt: 'mp4',
        timeoutMs: 20,
        lookup,
        fetchImpl: (async (_url, init) => {
          await new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          })
          return new Response(null)
        }) as typeof fetch,
      })
    ).rejects.toBeInstanceOf(DownloadFailedError)
  })
})

describe('VL-P1 queue lease recovery', () => {
  it('recovers a stale RUNNING lease', async () => {
    const item = (await memoryRepo().insertInspected({
      metadata: {
        platform: 'generic',
        platformVideoId: 'abc',
        originalUrl: 'https://cdn.example.com/clip.mp4',
        normalizedUrl: 'https://cdn.example.com/clip.mp4',
        title: 'Clip',
        description: null,
        durationMs: 1000,
        width: null,
        height: null,
        aspectRatio: null,
        thumbnailUrl: null,
        publishedAt: null,
        source: {
          sourceProfileId: null,
          sourceUsername: null,
          sourceName: null,
          sourceUrl: null,
        },
      },
      createdBy: 'admin',
    })) as VideoLibraryItem
    const store = createMemoryImportStore([item])
    await enqueueDownloadJob(item.id, store)
    const now = new Date('2026-01-01T00:00:00.000Z')
    const first = await store.claimNextDownloadJob({ workerId: 'w1', now, leaseMs: 1 })
    expect(first?.status).toBe('RUNNING')
    const later = new Date(now.getTime() + 2000)
    const recovered = await store.claimNextDownloadJob({ workerId: 'w2', now: later, leaseMs: 90_000 })
    expect(recovered?.id).toBe(first?.id)
    expect(recovered?.claimedBy).toBe('w2')
    const listed = await store.listJobs(10)
    expect(listed[0].status).toBe('RUNNING')
  })

  it('does not retry forever after max attempts', async () => {
    const repo = memoryRepo()
    const item = await repo.insertInspected({
      metadata: {
        platform: 'generic',
        platformVideoId: 'fail',
        originalUrl: 'https://cdn.example.com/fail.mp4',
        normalizedUrl: 'https://cdn.example.com/fail.mp4',
        title: 'Clip',
        description: null,
        durationMs: null,
        width: null,
        height: null,
        aspectRatio: null,
        thumbnailUrl: null,
        publishedAt: null,
        source: {
          sourceProfileId: null,
          sourceUsername: null,
          sourceName: null,
          sourceUrl: null,
        },
      },
      createdBy: 'admin',
    })
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
      const p = join(tmpdir(), `vl-p1-${Math.random()}.mp4`)
      await writeFile(p, 'x')
      return { tempPath: p, mimeType: 'video/mp4', fileSizeBytes: 1, contentHash: 'aa', ext: 'mp4' }
    }
    const r1 = await processOneImportJob({ store, storage, download, maxAttempts: 1 })
    expect(r1.outcome).toBe('FAILED')
    const idle = await processOneImportJob({ store, storage, download, maxAttempts: 1 })
    expect(idle.outcome).toBe('IDLE')
  })
})
