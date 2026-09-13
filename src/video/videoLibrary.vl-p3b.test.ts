import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoLibraryItem } from '@/video/domain/types'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { createMemoryImportStore } from '@/video/importer/memoryStore'
import {
  expectedVideoLibraryBucketName,
  oneShotValidationGate,
  runOneShotImportValidation,
} from '@/video/importer/oneShotValidation'
import {
  isVideoLibraryEnabled,
  isVideoLibraryImportEnabled,
  isVideoLibraryOneShotValidationEnabled,
  isVideoLibraryProcessEnabled,
} from '@/video/featureFlag'

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn(async (request: Request) => {
    const header = request.headers.get('authorization')
    if (header === 'Bearer valid-admin') {
      return { uid: 'uid_admin', role: 'super_admin', email: 'admin@example.com' }
    }
    return null
  }),
}))

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
    processErrorCode: null,
    processErrorMessage: null,
    lastProcessJobId: null,
    playbackMimeType: null,
    playbackFileSizeBytes: null,
    videoCodec: null,
    audioCodec: null,
    fps: null,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const FLAG_KEYS = [
  'VIDEO_LIBRARY_ENABLED',
  'NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED',
  'VIDEO_LIBRARY_IMPORT_ENABLED',
  'VIDEO_LIBRARY_PROCESS_ENABLED',
  'VIDEO_LIBRARY_ONE_SHOT_VALIDATION_ENABLED',
  'VERCEL_ENV',
  'R2_BUCKET_NAME',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
]

describe('VL-P3B one-shot flags', () => {
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of FLAG_KEYS) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of FLAG_KEYS) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('defaults the temporary gate off', () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    expect(isVideoLibraryEnabled()).toBe(true)
    expect(isVideoLibraryImportEnabled()).toBe(false)
    expect(isVideoLibraryProcessEnabled()).toBe(false)
    expect(isVideoLibraryOneShotValidationEnabled()).toBe(false)
    expect(oneShotValidationGate().allowed).toBe(false)
  })

  it('requires production runtime plus explicit gate', () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    process.env.VIDEO_LIBRARY_ONE_SHOT_VALIDATION_ENABLED = 'true'
    expect(oneShotValidationGate().allowed).toBe(false)
    process.env.VERCEL_ENV = 'preview'
    expect(oneShotValidationGate().allowed).toBe(false)
    process.env.VERCEL_ENV = 'production'
    expect(isVideoLibraryOneShotValidationEnabled()).toBe(true)
    expect(oneShotValidationGate().allowed).toBe(true)
  })

  it('names the existing media bucket without accepting overrides from callers', () => {
    expect(expectedVideoLibraryBucketName()).toBe('nahaber-media')
    process.env.R2_BUCKET_NAME = 'nahaber-media'
    expect(expectedVideoLibraryBucketName()).toBe('nahaber-media')
  })
})

describe('VL-P3B one-shot job runner', () => {
  it('is idle when the queue is empty', async () => {
    const store = createMemoryImportStore()
    const result = await runOneShotImportValidation({
      store,
      storage: {
        async upload() {
          throw new Error('no upload on idle')
        },
        async exists() {
          return false
        },
      },
      r2Configured: true,
    })
    expect(result.outcome).toBe('IDLE')
    expect(result.itemId).toBeNull()
    expect(result.jobId).toBeNull()
  })

  it('processes exactly one DOWNLOAD job and never a PROCESS job', async () => {
    const item = sampleItem({ id: 'vli_once' })
    const store = createMemoryImportStore([item])
    await enqueueDownloadJob(item.id, store)
    await store.insertJob({
      itemId: item.id,
      kind: 'PROCESS',
      payload: { itemId: item.id },
    })
    const uploads: string[] = []
    const bytes = Buffer.from('fake-mp4-bytes')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const result = await runOneShotImportValidation({
      store,
      storage: {
        async upload(key: string) {
          uploads.push(key)
          return { key, url: `https://r2.test/${key}` }
        },
        async exists() {
          return true
        },
      },
      r2Configured: true,
      now: new Date('2026-09-13T00:00:00.000Z'),
      download: async () => {
        const p = join(tmpdir(), `vl-p3b-${Date.now()}.mp4`)
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
    expect(result.outcome).toBe('SUCCEEDED')
    expect(result.status).toBe('SUCCEEDED')
    expect(result.itemStatus).toBe('READY')
    expect(result.hashPresent).toBe(true)
    expect(result.objectExists).toBe(true)
    expect(result.storageKey).toMatch(/^video-library\/vli_once\/original\//)
    expect(result.mime).toBe('video/mp4')
    expect(result.bytes).toBe(bytes.length)
    expect(uploads).toHaveLength(1)
    expect(JSON.stringify(result)).not.toMatch(/SECRET|ACCOUNT_ID|DATABASE_URL|BEGIN /)
    const processJobs = store.jobs.filter((j) => j.kind === 'PROCESS')
    expect(processJobs).toHaveLength(1)
    expect(processJobs[0].status).toBe('QUEUED')
    const idle = await runOneShotImportValidation({
      store,
      storage: {
        async upload() {
          throw new Error('second upload')
        },
        async exists() {
          return true
        },
      },
      r2Configured: true,
    })
    expect(idle.outcome).toBe('IDLE')
    expect(uploads).toHaveLength(1)
  })
})

describe('VL-P3B one-shot HTTP surface', () => {
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of FLAG_KEYS) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of FLAG_KEYS) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('returns 404 when the gate is off and 401 without admin auth', async () => {
    const { POST, GET } = await import('@/app/api/admin/video-library/import-once-validation/route')
    const off = await POST(new Request('http://localhost/api/admin/video-library/import-once-validation', { method: 'POST' }))
    expect(off.status).toBe(404)
    const body = (await off.json()) as { code?: string }
    expect(body.code).toBe('VIDEO_LIBRARY_ONE_SHOT_VALIDATION_DISABLED')

    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    process.env.VIDEO_LIBRARY_ONE_SHOT_VALIDATION_ENABLED = 'true'
    process.env.VERCEL_ENV = 'production'
    const unauth = await POST(
      new Request('http://localhost/api/admin/video-library/import-once-validation', { method: 'POST' })
    )
    expect(unauth.status).toBe(401)
    const unauthGet = await GET(
      new Request('http://localhost/api/admin/video-library/import-once-validation')
    )
    expect(unauthGet.status).toBe(401)
  })

  it('ignores credential/bucket/command bodies and does not accept GET as an executor', async () => {
    process.env.VIDEO_LIBRARY_ENABLED = 'true'
    process.env.VIDEO_LIBRARY_ONE_SHOT_VALIDATION_ENABLED = 'true'
    process.env.VERCEL_ENV = 'production'
    const { POST, GET } = await import('@/app/api/admin/video-library/import-once-validation/route')
    const get = await GET(
      new Request('http://localhost/api/admin/video-library/import-once-validation', {
        headers: { authorization: 'Bearer valid-admin' },
      })
    )
    expect(get.status).toBe(405)

    const res = await POST(
      new Request('http://localhost/api/admin/video-library/import-once-validation', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-admin',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          credentials: 'do-not-use',
          bucket: 'other-bucket',
          path: '/etc/passwd',
          command: 'rm -rf /',
        }),
      })
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code?: string; bucket?: string }
    expect(body.code).toBe('R2_NOT_CONFIGURED')
    expect(body.bucket).toBeUndefined()
  })
})
