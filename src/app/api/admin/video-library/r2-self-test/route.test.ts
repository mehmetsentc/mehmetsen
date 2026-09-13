import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { POST } from './route'
import * as r2SelfTest from '@/lib/storage/r2SelfTest'

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn(),
}))

vi.mock('@/lib/storage/r2SelfTest', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/r2SelfTest')>(
    '@/lib/storage/r2SelfTest',
  )
  return {
    ...actual,
    runR2SelfTest: vi.fn(),
    cleanupR2SelfTest: vi.fn(),
  }
})

function request(body: unknown, auth = true) {
  return new Request('http://localhost/api/admin/video-library/r2-self-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer test-token' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/video-library/r2-self-test', () => {
  afterEach(() => {
    vi.mocked(verifyCmsToken).mockReset()
    vi.mocked(r2SelfTest.runR2SelfTest).mockReset()
    vi.mocked(r2SelfTest.cleanupR2SelfTest).mockReset()
    vi.unstubAllEnvs()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue(null)
    const res = await POST(request({ action: 'run' }, false))
    expect(res.status).toBe(401)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
  })

  it('returns 403 when the role lacks video:edit', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({
      uid: 'u1',
      role: 'author',
      email: 'author@example.com',
    })
    const res = await POST(request({ action: 'run' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
  })

  it('redacts secrets from the diagnostic JSON', async () => {
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'super-secret-r2-key')
    vi.mocked(verifyCmsToken).mockResolvedValue({
      uid: 'admin',
      role: 'editor',
      email: 'ed@example.com',
    })
    vi.mocked(r2SelfTest.runR2SelfTest).mockResolvedValue({
      action: 'run',
      configured: true,
      validationId: '55555555-5555-4555-8111-555555555555',
      upload: 'PASS',
      publicGet: 'PASS',
      rangeStart: 'PASS',
      rangeMiddle: 'PASS',
      faststart: 'PASS',
      cors: 'PASS',
      cleanupRequired: true,
      objects: { original: null, poster: null, playback: null },
      publicHttp: null,
      range: { start: null, middle: null },
      faststartDetail: null,
      corsFinding: null,
      playbackPublicUrl: 'https://cdn.example.test/video-library-validation/x/playback-720p.mp4',
      posterPublicUrl: null,
    })
    const res = await POST(request({ action: 'run' }))
    const body = await res.json()
    const serialized = JSON.stringify(body)
    expect(res.status).toBe(200)
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toMatch(/R2_SECRET_ACCESS_KEY/)
  })

  it('rejects cleanup outside the validation namespace', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({
      uid: 'admin',
      role: 'video_editor',
      email: 'v@example.com',
    })
    vi.mocked(r2SelfTest.cleanupR2SelfTest).mockRejectedValue(new Error('INVALID_VALIDATION_ID'))
    const res = await POST(request({ action: 'cleanup', validationId: '../../news/cover' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('INVALID_VALIDATION_ID')
    expect(body.cleanup).toBe('FAIL')
  })
})
