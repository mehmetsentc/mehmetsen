import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageProvider } from './types'
import {
  VALIDATION_PREFIX,
  allValidationKeys,
  assertSafeDiagnosticJson,
  assertSafeValidationId,
  cleanupR2SelfTest,
  findMp4BoxOffsets,
  isR2SelfTestEnabled,
  runR2SelfTest,
  validationObjectKey,
} from './r2SelfTest'
import {
  ORIGINAL_MP4_BASE64,
  PLAYBACK_MP4_BASE64,
  fixtureBytes,
} from './r2SelfTestFixtures'

function mockStorage(overrides: Partial<StorageProvider> = {}): StorageProvider & {
  uploaded: string[]
  deleted: string[]
} {
  const uploaded: string[] = []
  const deleted: string[] = []
  const objects = new Map<string, Uint8Array>()
  const storage: StorageProvider & { uploaded: string[]; deleted: string[] } = {
    name: 'r2',
    uploaded,
    deleted,
    async upload(key, body) {
      uploaded.push(key)
      const bytes = body instanceof Uint8Array ? body : new Uint8Array()
      objects.set(key, bytes)
      return { key, url: `https://cdn.example.test/${key}`, contentType: 'video/mp4' }
    },
    getPublicUrl(key) {
      return `https://cdn.example.test/${key}`
    },
    async delete(key) {
      deleted.push(key)
      objects.delete(key)
    },
    async exists(key) {
      return objects.has(key)
    },
    ...overrides,
  }
  return storage
}

function jsonResponse(body: Uint8Array | string, init: ResponseInit): Response {
  const payload = typeof body === 'string' ? body : Buffer.from(body)
  return new Response(payload, init)
}

function playbackFetch(playback: Uint8Array): typeof fetch {
  return (async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://www.nahaber.com',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'range',
        },
      })
    }
    const range = headers.get('Range')
    if (range) {
      const m = /^bytes=(\d+)-(\d+)$/.exec(range)
      if (!m) return jsonResponse('', { status: 416 })
      const start = Number(m[1])
      const end = Number(m[2])
      const slice = playback.slice(start, end + 1)
      return jsonResponse(slice, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${playback.byteLength}`,
          'Content-Length': String(slice.byteLength),
          'Accept-Ranges': 'bytes',
          ETag: '"playback"',
          'Cache-Control': 'public, max-age=120',
          'Access-Control-Allow-Origin': 'https://www.nahaber.com',
        },
      })
    }
    return jsonResponse(playback, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(playback.byteLength),
        'Accept-Ranges': 'bytes',
        ETag: '"playback"',
        'Cache-Control': 'public, max-age=120',
        'Access-Control-Allow-Origin': 'https://www.nahaber.com',
      },
    })
  }) as typeof fetch
}

describe('V1C.1R4 R2 self-test helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('restricts keys to video-library-validation/{uuid}/known names', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(validationObjectKey(id, 'playback-720p.mp4')).toBe(
      `${VALIDATION_PREFIX}${id}/playback-720p.mp4`,
    )
    expect(() => validationObjectKey('../news', 'original.mp4')).toThrow('INVALID_VALIDATION_ID')
    expect(() => validationObjectKey(id, 'original.mp4/../../secret')).toThrow('INVALID_OBJECT_NAME')
    expect(() => validationObjectKey(id, 'news/cover/x.webp')).toThrow('INVALID_OBJECT_NAME')
    expect(() => assertSafeValidationId('video-library/abc')).toThrow('INVALID_VALIDATION_ID')
    expect(() => validationObjectKey(id + '/../x', 'original.mp4')).toThrow('INVALID_VALIDATION_ID')
  })

  it('is disabled unless R2_SELF_TEST_ENABLED is 1 or true', () => {
    expect(isR2SelfTestEnabled()).toBe(false)
    vi.stubEnv('R2_SELF_TEST_ENABLED', '0')
    expect(isR2SelfTestEnabled()).toBe(false)
    vi.stubEnv('R2_SELF_TEST_ENABLED', '1')
    expect(isR2SelfTestEnabled()).toBe(true)
    vi.stubEnv('R2_SELF_TEST_ENABLED', 'true')
    expect(isR2SelfTestEnabled()).toBe(true)
  })

  it('cleanup only targets the three validation keys', async () => {
    const id = '22222222-2222-4222-8111-222222222222'
    const storage = mockStorage()
    const result = await cleanupR2SelfTest(id, { storage, configured: true })
    expect(storage.deleted).toEqual(allValidationKeys(id))
    expect(storage.deleted.every((k) => k.startsWith(VALIDATION_PREFIX + id + '/'))).toBe(true)
    expect(storage.deleted.some((k) => k.includes('news/') || k.includes('..'))).toBe(false)
    expect(result.createdCount).toBe(0)
    expect(result.deletedCount).toBe(0)
    expect(result.remainingCount).toBe(0)
    expect(result.cleanup).toBe('PASS')
    expect(result.go).toBe(true)
  })

  it('GO only when createdCount equals deletedCount and remainingCount is 0', async () => {
    const id = '66666666-6666-4666-8666-666666666666'
    const storage = mockStorage()
    for (const key of allValidationKeys(id)) {
      await storage.upload(key, new Uint8Array([1, 2, 3]), { contentType: 'video/mp4' })
    }
    const result = await cleanupR2SelfTest(id, { storage, configured: true })
    expect(result.createdCount).toBe(3)
    expect(result.deletedCount).toBe(3)
    expect(result.remainingCount).toBe(0)
    expect(result.cleanup).toBe('PASS')
    expect(result.go).toBe(true)
  })

  it('fails GO when a leftover validation object remains', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    const storage = mockStorage()
    for (const key of allValidationKeys(id)) {
      await storage.upload(key, new Uint8Array([1, 2, 3]), { contentType: 'video/mp4' })
    }
    const innerDelete = storage.delete.bind(storage)
    storage.delete = async (key) => {
      if (key.endsWith('poster.webp')) return
      await innerDelete(key)
    }
    const result = await cleanupR2SelfTest(id, { storage, configured: true })
    expect(result.createdCount).toBe(3)
    expect(result.deletedCount).toBe(2)
    expect(result.remainingCount).toBe(1)
    expect(result.cleanup).toBe('FAIL')
    expect(result.go).toBe(false)
  })

  it('rejects secret values and presence fingerprints from diagnostic JSON', () => {
    const secret = 'super-secret-r2-key-value'
    vi.stubEnv('R2_SECRET_ACCESS_KEY', secret)
    vi.stubEnv('R2_ACCESS_KEY_ID', 'AKIAEXAMPLEKEY99')
    expect(() => assertSafeDiagnosticJson({ configured: true, secretLength: secret.length })).toThrow(
      'UNSAFE_DIAGNOSTIC_PAYLOAD',
    )
    expect(() => assertSafeDiagnosticJson({ configured: true, secretPrefix: secret.slice(0, 4) })).toThrow(
      'UNSAFE_DIAGNOSTIC_PAYLOAD',
    )
    expect(() => assertSafeDiagnosticJson({ configured: true, secretSuffix: secret.slice(-4) })).toThrow(
      'UNSAFE_DIAGNOSTIC_PAYLOAD',
    )
    expect(() => assertSafeDiagnosticJson({ configured: true, maskedSecret: `****${secret.slice(-4)}` })).toThrow(
      'UNSAFE_DIAGNOSTIC_PAYLOAD',
    )
    expect(() =>
      assertSafeDiagnosticJson({
        configured: true,
        secretHash: createHash('sha256').update(secret).digest('hex'),
      }),
    ).toThrow('UNSAFE_DIAGNOSTIC_PAYLOAD')
    expect(() => assertSafeDiagnosticJson({ configured: true, leaked: secret })).toThrow(
      'UNSAFE_DIAGNOSTIC_PAYLOAD',
    )
    expect(() => assertSafeDiagnosticJson({ configured: true, enabled: false, go: false })).not.toThrow()
  })

  it('rejects path-traversal cleanup ids before touching storage', async () => {
    const storage = mockStorage()
    await expect(
      cleanupR2SelfTest('../../publishers/x', { storage, configured: true }),
    ).rejects.toThrow('INVALID_VALIDATION_ID')
    expect(storage.deleted).toEqual([])
  })

  it('parses faststart from fixture bytes (moov before mdat)', () => {
    const boxes = findMp4BoxOffsets(fixtureBytes(PLAYBACK_MP4_BASE64))
    expect(boxes.ftyp).toBe(0)
    expect(boxes.moov).not.toBeNull()
    expect(boxes.mdat).not.toBeNull()
    expect(boxes.moov! < boxes.mdat!).toBe(true)
  })

  it('runs mocked storage + public HTTP chain without leaking env secrets', async () => {
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'super-secret-r2-key')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'AKIAEXAMPLE')
    const playback = fixtureBytes(PLAYBACK_MP4_BASE64)
    const original = fixtureBytes(ORIGINAL_MP4_BASE64)
    expect(original.byteLength).toBe(playback.byteLength)
    const storage = mockStorage()
    const id = '33333333-3333-4333-8111-333333333333'
    const result = await runR2SelfTest({
      storage,
      configured: true,
      fetchImpl: playbackFetch(playback),
      nowId: () => id,
    })
    const serialized = JSON.stringify(result)
    expect(result.configured).toBe(true)
    expect(result.upload).toBe('PASS')
    expect(result.publicGet).toBe('PASS')
    expect(result.rangeStart).toBe('PASS')
    expect(result.rangeMiddle).toBe('PASS')
    expect(result.faststart).toBe('PASS')
    expect(result.cors).toBe('PASS')
    expect(result.cleanupRequired).toBe(true)
    expect(storage.uploaded).toEqual(allValidationKeys(id))
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('AKIAEXAMPLE')
    expect(serialized).not.toContain('R2_SECRET')
    expect(serialized).not.toMatch(/secretLength|secretPrefix|secretSuffix|maskedSecret|secretHash/)
    expect(result).not.toHaveProperty('secretLength')
    expect(typeof result.configured).toBe('boolean')
    expect(result.objects.playback?.bytes).toBe(playback.byteLength)
    expect(result.objects.playback?.mime).toBe('video/mp4')
  })

  it('does not PASS CORS when Access-Control-Allow-Origin is missing', async () => {
    const playback = fixtureBytes(PLAYBACK_MP4_BASE64)
    const storage = mockStorage()
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await playbackFetch(playback)(input, init)
      const headers = new Headers(res.headers)
      headers.delete('Access-Control-Allow-Origin')
      return new Response(res.body, { status: res.status, headers })
    }) as typeof fetch
    const result = await runR2SelfTest({
      storage,
      configured: true,
      fetchImpl,
      nowId: () => '44444444-4444-4444-8111-444444444444',
    })
    expect(result.cors).toBe('FAIL')
    expect(result.corsFinding).toMatch(/missing CORS/)
    expect(result.publicGet).toBe('PASS')
    expect(result.rangeStart).toBe('PASS')
  })

  it('skips when R2 is not configured', async () => {
    const result = await runR2SelfTest({ configured: false })
    expect(result.configured).toBe(false)
    expect(result.upload).toBe('SKIP')
    expect(result.cleanupRequired).toBe(false)
  })
})

describe('V1C.1R5 CORS apply', () => {
  it('keeps existing origins while adding nahaber playback rule', async () => {
    let stored: string | null =
      '<CORSConfiguration><CORSRule><AllowedOrigin>https://publisher.example</AllowedOrigin><AllowedMethod>GET</AllowedMethod></CORSRule></CORSConfiguration>'
    const cors = {
      async getBucketCors() {
        return { status: stored ? 200 : 404, xml: stored }
      },
      async putBucketCors(xml: string) {
        stored = xml
      },
    }
    const { applyPlaybackCors } = await import('./r2SelfTest')
    const result = await applyPlaybackCors({ configured: true, cors })
    expect(result.apply).toBe('PASS')
    expect(result.before).toHaveLength(1)
    expect(result.after?.map((rule) => rule.origins).flat()).toEqual([
      'https://publisher.example',
      'https://www.nahaber.com',
    ])
  })
})
