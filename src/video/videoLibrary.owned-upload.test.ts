import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { matchesDedupKeys } from '@/video/domain/dedup'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'
import type { VideoLibraryRepository } from '@/video/library/types'
import {
  completeOwnedUpload,
  initOwnedUpload,
  ownedNormalizedUrl,
  parseOwnedUploadInit,
} from '@/video/library/ownedUpload'
import {
  importDirectNow,
  importDirectNowMany,
  pickDirectImportUrls,
} from '@/video/library/importDirectNow'
import { createMemoryImportStore } from '@/video/importer/memoryStore'
import { parseDownloadUrl, UnsafeDownloadUrlError } from '@/video/security/ssrf'
import { videoLibraryMaxBytes } from '@/video/featureFlag'
import { POST as libraryPOST } from '@/app/api/admin/videos/library/route'

const HASH = 'ab'.repeat(32)

function memoryRepo(): VideoLibraryRepository & { items: VideoLibraryItem[]; presigns: number } {
  const items: VideoLibraryItem[] = []
  return {
    items,
    presigns: 0,
    async findByDedup(keys) {
      return items.find((item) => matchesDedupKeys(item, keys)) ?? null
    },
    async insertInspected({ metadata, createdBy }) {
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
    async insertOwnedUpload(input) {
      const now = new Date()
      const ownedUrl = ownedNormalizedUrl(input.contentHash)
      const item: VideoLibraryItem = {
        id: input.id,
        platform: 'generic',
        platformVideoId: input.contentHash,
        originalUrl: ownedUrl,
        normalizedUrl: ownedUrl,
        sourceProfileId: null,
        sourceUsername: null,
        sourceName: null,
        sourceUrl: null,
        title: input.title,
        description: null,
        durationMs: null,
        width: null,
        height: null,
        aspectRatio: null,
        thumbnailUrl: null,
        posterStorageKey: null,
        originalStorageKey: input.originalStorageKey,
        playbackStorageKey: null,
        streamManifestKey: null,
        renditions: [],
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        publishedAt: null,
        importedAt: null,
        publishedNewsId: null,
        status: 'PENDING_IMPORT',
        rightsStatus: 'OWNED',
        contentHash: input.contentHash,
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
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
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

function dummyStorage() {
  return {
    async upload(): Promise<never> {
      throw new Error('upload must not run')
    },
    async exists(): Promise<boolean> {
      return false
    },
  }
}

describe('owned upload parse', () => {
  it('accepts mp4/webm/mov/m4v and a 64-char hash', () => {
    for (const mimeType of ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']) {
      const parsed = parseOwnedUploadInit({
        filename: 'clip.mp4',
        mimeType,
        fileSizeBytes: 1024,
        contentHash: HASH.toUpperCase(),
      })
      expect(parsed).toEqual({
        ok: true,
        filename: 'clip.mp4',
        mimeType,
        fileSizeBytes: 1024,
        contentHash: HASH,
      })
    }
  })

  it('rejects mime, size, hash, and client bucket/key/credential overrides', () => {
    expect(parseOwnedUploadInit({ mimeType: 'video/avi', fileSizeBytes: 10, contentHash: HASH }).ok).toBe(
      false
    )
    expect(
      parseOwnedUploadInit({ mimeType: 'video/mp4', fileSizeBytes: 0, contentHash: HASH })
    ).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' })
    expect(
      parseOwnedUploadInit({
        mimeType: 'video/mp4',
        fileSizeBytes: videoLibraryMaxBytes() + 1,
        contentHash: HASH,
      })
    ).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' })
    expect(
      parseOwnedUploadInit({ mimeType: 'video/mp4', fileSizeBytes: 10, contentHash: 'zzzz' })
    ).toMatchObject({ ok: false, code: 'INVALID_HASH' })
    expect(
      parseOwnedUploadInit({
        mimeType: 'video/mp4',
        fileSizeBytes: 10,
        contentHash: HASH,
        bucket: 'evil-bucket',
      })
    ).toMatchObject({ ok: false, code: 'INVALID_UPLOAD_FIELDS' })
    expect(
      parseOwnedUploadInit({
        mimeType: 'video/mp4',
        fileSizeBytes: 10,
        contentHash: HASH,
        storageKey: 'other/key.mp4',
      })
    ).toMatchObject({ ok: false, code: 'INVALID_UPLOAD_FIELDS' })
    expect(
      parseOwnedUploadInit({
        mimeType: 'video/mp4',
        fileSizeBytes: 10,
        contentHash: HASH,
        credentials: { accessKeyId: 'AKIA' },
      })
    ).toMatchObject({ ok: false, code: 'INVALID_UPLOAD_FIELDS' })
    expect(
      parseOwnedUploadInit({
        mimeType: 'video/mp4',
        fileSizeBytes: 10,
        contentHash: HASH,
        command: 'put',
        path: '/tmp',
      })
    ).toMatchObject({ ok: false, code: 'INVALID_UPLOAD_FIELDS' })
  })

  it('uses a synthetic URL that SSRF download cannot fetch', () => {
    const url = ownedNormalizedUrl(HASH)
    expect(url).toBe(`nahaber-owned://sha256/${HASH}`)
    expect(() => parseDownloadUrl(url)).toThrow(UnsafeDownloadUrlError)
    try {
      parseDownloadUrl(url)
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_PROTOCOL' })
    }
  })
})

describe('owned upload init/complete', () => {
  it('presigns a new object and completes READY/OWNED after HEAD', async () => {
    const repo = memoryRepo()
    const store = createMemoryImportStore(repo.items)
    const presignPut = vi.fn(async (key: string, contentType: string) => {
      repo.presigns += 1
      expect(contentType).toBe('video/mp4')
      expect(key).toMatch(/^video-library\/vli_[^/]+\/original\/original\.mp4$/)
      return `https://r2.example/put?key=${key}`
    })
    const parsed = parseOwnedUploadInit({
      filename: 'mine.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 2048,
      contentHash: HASH,
    })
    if (!parsed.ok) throw new Error(parsed.code)
    const init = await initOwnedUpload({
      parsed,
      createdBy: 'admin',
      repository: repo,
      store,
      presignPut,
    })
    expect(init.outcome).toBe('UPLOAD')
    expect(init.uploadUrl).toContain('https://r2.example/put')
    expect(presignPut).toHaveBeenCalledTimes(1)
    expect(repo.items[0]?.rightsStatus).toBe('OWNED')
    expect(repo.items[0]?.status).toBe('PENDING_IMPORT')

    const completed = await completeOwnedUpload({
      itemId: init.item.id,
      store,
      head: async (key) => {
        expect(key).toBe(init.storageKey)
        return { exists: true, contentType: 'video/mp4', contentLength: 2048 }
      },
    })
    expect(completed.status).toBe('READY')
    expect(completed.rightsStatus).toBe('OWNED')
  })

  it('does not presign again when the same hash is already READY', async () => {
    const repo = memoryRepo()
    const store = createMemoryImportStore(repo.items)
    const first = await repo.insertOwnedUpload({
      id: newVideoLibraryId('vli'),
      createdBy: 'admin',
      title: 'mine.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 2048,
      contentHash: HASH,
      originalStorageKey: `video-library/keep/original/original.mp4`,
    })
    await store.updateItem(first.id, { status: 'READY', updatedAt: new Date() })
    const presignPut = vi.fn(async () => 'https://r2.example/should-not-run')
    const parsed = parseOwnedUploadInit({
      filename: 'mine-again.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 2048,
      contentHash: HASH,
    })
    if (!parsed.ok) throw new Error(parsed.code)
    const init = await initOwnedUpload({
      parsed,
      createdBy: 'admin',
      repository: repo,
      store,
      presignPut,
    })
    expect(init.outcome).toBe('ALREADY_IMPORTED')
    expect(init.uploadUrl).toBeNull()
    expect(presignPut).not.toHaveBeenCalled()
    expect(repo.items).toHaveLength(1)
  })
})

describe('import-direct-now social URLs', () => {
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
        throw new Error(`unexpected fetch ${url}`)
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects Instagram as PLATFORM_METADATA_ONLY', async () => {
    const repo = memoryRepo()
    await expect(
      importDirectNow({
        url: 'https://www.instagram.com/reel/AbC123xyz/',
        createdBy: 'admin',
        repository: repo,
        store: createMemoryImportStore(repo.items),
        storage: dummyStorage(),
      })
    ).rejects.toThrow('PLATFORM_METADATA_ONLY')
  })

  it('rejects YouTube as YOUTUBE_NOT_DIRECT_MEDIA', async () => {
    const repo = memoryRepo()
    await expect(
      importDirectNow({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
        createdBy: 'admin',
        repository: repo,
        store: createMemoryImportStore(repo.items),
        storage: dummyStorage(),
      })
    ).rejects.toThrow('YOUTUBE_NOT_DIRECT_MEDIA')
  })

  it('bulk selection keeps only downloadable rows', () => {
    expect(
      pickDirectImportUrls(
        [
          { originalUrl: 'https://cdn.example.com/a.mp4', downloadable: true, error: null },
          { originalUrl: 'https://www.instagram.com/reel/AbC123xyz/', downloadable: false, error: null },
          { originalUrl: 'https://cdn.example.com/b.webm', downloadable: true, error: null },
        ],
        {
          'https://cdn.example.com/a.mp4': true,
          'https://www.instagram.com/reel/AbC123xyz/': true,
          'https://cdn.example.com/b.webm': false,
        }
      )
    ).toEqual(['https://cdn.example.com/a.mp4'])
  })

  it('bulk import skips Instagram and YouTube without calling storage', async () => {
    const repo = memoryRepo()
    const result = await importDirectNowMany({
      urls: [
        'https://www.instagram.com/reel/AbC123xyz/',
        'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      ],
      createdBy: 'admin',
      repository: repo,
      store: createMemoryImportStore(repo.items),
      storage: dummyStorage(),
    })
    expect(result.selected).toBe(2)
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(2)
    expect(result.rows.map((row) => row.code)).toEqual([
      'PLATFORM_METADATA_ONLY',
      'YOUTUBE_NOT_DIRECT_MEDIA',
    ])
  })
})

describe('owned upload API auth', () => {
  const keys = ['VIDEO_LIBRARY_ENABLED', 'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED']
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of keys) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
  })
  afterEach(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('returns 401 without a CMS token', async () => {
    for (const action of ['upload-init', 'upload-complete', 'import-direct-now'] as const) {
      const res = await libraryPOST(
        new Request('http://localhost/api/admin/videos/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            url: 'https://cdn.example.com/clip.mp4',
            id: 'vli_x',
            mimeType: 'video/mp4',
            fileSizeBytes: 10,
            contentHash: HASH,
            bucket: 'evil',
            credentials: { secret: 'x' },
          }),
        })
      )
      expect(res.status).toBe(401)
    }
  })
})
