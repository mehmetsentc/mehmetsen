import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { matchesDedupKeys, dedupKeysFromMetadata } from '@/video/domain/dedup'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem, VideoMetadata } from '@/video/domain/types'
import { isVideoLibraryEnabled } from '@/video/featureFlag'
import { inspectVideoUrl } from '@/video/library/inspect'
import { registerVideoUrl } from '@/video/library/register'
import type { VideoLibraryRepository } from '@/video/library/types'
import { detectVideoProvider } from '@/video/providers/registry'
import { createYoutubeProvider } from '@/video/providers/youtube'
import { planPlaybackRenditions } from '@/video/processing/types'
import { assertPublishingNotImplemented } from '@/video/publisher/types'
import { buildDownloadJobPayload } from '@/video/storage/jobs'
import { buildVideoLibraryMediaKey } from '@/video/storage/keys'
import { DEFAULT_CMS_FEATURE_FLAGS } from '@/types/newsroomOs'

function memoryRepo(): VideoLibraryRepository & { items: VideoLibraryItem[] } {
  const items: VideoLibraryItem[] = []
  return {
    items,
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

function youtubeMeta(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    platform: 'youtube',
    platformVideoId: 'dQw4w9wgXcQ',
    originalUrl: 'https://youtu.be/dQw4w9wgXcQ?si=abc',
    normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
    title: 'Sample',
    description: null,
    durationMs: null,
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9wgXcQ/hqdefault.jpg',
    publishedAt: null,
    source: {
      sourceProfileId: null,
      sourceUsername: 'Rick',
      sourceName: 'Rick',
      sourceUrl: 'https://www.youtube.com/@rick',
    },
    ...overrides,
  }
}

describe('V1A Video Library feature flag', () => {
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ['VIDEO_LIBRARY_ENABLED', 'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED']) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ['VIDEO_LIBRARY_ENABLED', 'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED']) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('defaults to false via CMS flag', () => {
    expect(DEFAULT_CMS_FEATURE_FLAGS.videoLibraryEnabled).toBe(false)
    expect(isVideoLibraryEnabled()).toBe(false)
  })

  it('turns on with VIDEO_LIBRARY_ENABLED=true', () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    expect(isVideoLibraryEnabled()).toBe(true)
  })
})

describe('V1A provider detection + normalize', () => {
  it('canonicalizes YouTube watch / youtu.be / shorts to the same id', async () => {
    const provider = detectVideoProvider('https://youtu.be/dQw4w9wgXcQ?si=tracking')
    expect(provider.platform).toBe('youtube')
    expect(await provider.normalizeUrl('https://www.youtube.com/watch?v=dQw4w9wgXcQ&feature=share')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ'
    )
    expect(await provider.normalizeUrl('https://www.youtube.com/shorts/dQw4w9wgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ'
    )
  })

  it('detects instagram / tiktok / x / facebook without mixing platforms', () => {
    expect(detectVideoProvider('https://www.instagram.com/reel/AbC123xyz/').platform).toBe('instagram')
    expect(detectVideoProvider('https://www.tiktok.com/@user/video/1234567890123456789').platform).toBe('tiktok')
    expect(detectVideoProvider('https://twitter.com/nahaber/status/1234567890123456789').platform).toBe('x')
    expect(detectVideoProvider('https://www.facebook.com/watch?v=111222333').platform).toBe('facebook')
    expect(detectVideoProvider('https://example.com/clip.mp4').platform).toBe('generic')
  })

  it('reads YouTube oEmbed metadata without importing a file', async () => {
    const provider = createYoutubeProvider({
      fetchOembed: async () => ({
        title: 'Never Gonna Give You Up',
        author_name: 'RickAstleyVEVO',
        author_url: 'https://www.youtube.com/@RickAstleyVEVO',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9wgXcQ/hqdefault.jpg',
        width: 480,
        height: 270,
      }),
    })
    const meta = await provider.getMetadata('https://youtu.be/dQw4w9wgXcQ')
    expect(meta.platformVideoId).toBe('dQw4w9wgXcQ')
    expect(meta.title).toBe('Never Gonna Give You Up')
    expect(provider.importVideo).toBeUndefined()
  })
})

describe('V1A inspect + register dedup', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          title: 'Sample',
          author_name: 'Rick',
          author_url: 'https://www.youtube.com/@rick',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9wgXcQ/hqdefault.jpg',
        }),
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('inspects then registers once; second URL returns ALREADY_EXISTS', async () => {
    const repo = memoryRepo()
    const first = await registerVideoUrl(
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      'admin_1',
      repo
    )
    expect(first.outcome).toBe('CREATED')
    if (first.outcome !== 'CREATED') throw new Error('expected CREATED')
    expect(first.item.rightsStatus).toBe('UNKNOWN')
    expect(first.item.status).toBe('INSPECTED')
    expect(first.item.originalStorageKey).toBeNull()

    const second = await registerVideoUrl(
      'https://youtu.be/dQw4w9wgXcQ?si=dup',
      'admin_1',
      repo
    )
    expect(second.outcome).toBe('ALREADY_EXISTS')
    if (second.outcome !== 'ALREADY_EXISTS') throw new Error('expected ALREADY_EXISTS')
    expect(second.item.id).toBe(first.item.id)
    expect(repo.items).toHaveLength(1)
  })

  it('inspect reports existing without inserting', async () => {
    const repo = memoryRepo()
    const existing = await repo.insertInspected({
      metadata: youtubeMeta(),
      createdBy: 'admin_1',
    })
    const inspected = await inspectVideoUrl(
      'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      {
        ...repo,
        async insertInspected() {
          throw new Error('insert must not run on inspect')
        },
      }
    )
    expect(inspected.existing?.id).toBe(existing.id)
    expect(inspected.metadata.normalizedUrl).toBe('https://www.youtube.com/watch?v=dQw4w9wgXcQ')
  })
})

describe('V1A storage / processing architecture', () => {
  it('builds R2 keys under video-library/ on the existing bucket convention', () => {
    const key = buildVideoLibraryMediaKey({
      itemId: 'vli_abc',
      kind: 'original',
      filename: 'source.mp4',
    })
    expect(key).toBe('video-library/vli_abc/original/source.mp4')
  })

  it('plans 480/720/1080 renditions without running a transcoder', () => {
    const plan = planPlaybackRenditions('vli_abc')
    expect(plan.renditions.map((r) => r.height)).toEqual([480, 720, 1080])
    expect(plan.manifestKey).toContain('/manifest/index.m3u8')
    expect(buildDownloadJobPayload('vli_abc', 'https://example.com/v.mp4').kind).toBe('DOWNLOAD')
  })

  it('does not implement publisher yet', () => {
    expect(() => assertPublishingNotImplemented()).toThrow('VIDEO_LIBRARY_PUBLISH_NOT_IMPLEMENTED')
  })

  it('dedup keys include platform id + normalized url', () => {
    const keys = dedupKeysFromMetadata(youtubeMeta())
    expect(keys.platform).toBe('youtube')
    expect(keys.platformVideoId).toBe('dQw4w9wgXcQ')
    expect(keys.contentHash).toBeNull()
  })
})
