import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { GET, POST } from './route'
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
    inspectR2Cors: vi.fn(),
    applyPlaybackCors: vi.fn(),
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

function editorAuth() {
  vi.mocked(verifyCmsToken).mockResolvedValue({
    uid: 'admin',
    role: 'editor',
    email: 'ed@example.com',
  })
}

function enableSelfTest() {
  vi.stubEnv('R2_SELF_TEST_ENABLED', '1')
}

describe('POST /api/admin/video-library/r2-self-test', () => {
  afterEach(() => {
    vi.mocked(verifyCmsToken).mockReset()
    vi.mocked(r2SelfTest.runR2SelfTest).mockReset()
    vi.mocked(r2SelfTest.cleanupR2SelfTest).mockReset()
    vi.mocked(r2SelfTest.inspectR2Cors).mockReset()
    vi.mocked(r2SelfTest.applyPlaybackCors).mockReset()
    vi.unstubAllEnvs()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue(null)
    const res = await POST(request({ action: 'run' }, false))
    expect(res.status).toBe(401)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.cleanupR2SelfTest).not.toHaveBeenCalled()
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

  it('is disabled by default and performs no R2 mutation', async () => {
    editorAuth()
    const res = await POST(request({ action: 'run' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('R2_SELF_TEST_DISABLED')
    expect(body.enabled).toBe(false)
    expect(typeof body.configured).toBe('boolean')
    expect(body.go).toBe(false)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.cleanupR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.applyPlaybackCors).not.toHaveBeenCalled()
    expect(r2SelfTest.inspectR2Cors).not.toHaveBeenCalled()
  })

  it('does not mutate R2 without an explicit run or cleanup action', async () => {
    editorAuth()
    enableSelfTest()
    const missing = await POST(request({}))
    expect(missing.status).toBe(400)
    expect((await missing.json()).error).toBe('ACTION_REQUIRED')
    const invalid = await POST(request({ action: 'status' }))
    expect(invalid.status).toBe(400)
    const empty = await POST(
      new Request('http://localhost/api/admin/video-library/r2-self-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: '',
      }),
    )
    expect(empty.status).toBe(400)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.cleanupR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.applyPlaybackCors).not.toHaveBeenCalled()
    expect(r2SelfTest.inspectR2Cors).not.toHaveBeenCalled()
  })

  it('blocks cors-apply while the kill switch is off', async () => {
    editorAuth()
    const res = await POST(request({ action: 'cors-apply' }))
    expect(res.status).toBe(403)
    expect(r2SelfTest.applyPlaybackCors).not.toHaveBeenCalled()
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
  })

  it('GET is a no-op 405 and never mutates R2', async () => {
    const res = await GET()
    expect(res.status).toBe(405)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.cleanupR2SelfTest).not.toHaveBeenCalled()
    expect(r2SelfTest.applyPlaybackCors).not.toHaveBeenCalled()
  })

  it('redacts secrets and presence fingerprints from the diagnostic JSON', async () => {
    const secret = 'super-secret-r2-key'
    vi.stubEnv('R2_SECRET_ACCESS_KEY', secret)
    enableSelfTest()
    editorAuth()
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
    expect(serialized).not.toContain(createHash('sha256').update(secret).digest('hex'))
    expect(serialized).not.toMatch(/secretLength|secretPrefix|secretSuffix|maskedSecret|secretHash/)
    expect(typeof body.configured).toBe('boolean')
  })

  it('does not GO when cleanup leaves remaining objects', async () => {
    enableSelfTest()
    editorAuth()
    vi.mocked(r2SelfTest.cleanupR2SelfTest).mockResolvedValue({
      action: 'cleanup',
      configured: true,
      validationId: '88888888-8888-4888-8888-888888888888',
      createdCount: 3,
      deletedCount: 2,
      remainingCount: 1,
      cleanup: 'FAIL',
      go: false,
    })
    const res = await POST(
      request({ action: 'cleanup', validationId: '88888888-8888-4888-8888-888888888888' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.createdCount).toBe(3)
    expect(body.deletedCount).toBe(2)
    expect(body.remainingCount).toBe(1)
    expect(body.cleanup).toBe('FAIL')
    expect(body.go).toBe(false)
  })

  it('cleans up a manually supplied valid id without calling Run', async () => {
    enableSelfTest()
    editorAuth()
    const id = '2ff806f2-6f8a-4fca-9f93-fd045ad5639a'
    vi.mocked(r2SelfTest.cleanupR2SelfTest).mockResolvedValue({
      action: 'cleanup',
      configured: true,
      validationId: id,
      createdCount: 3,
      deletedCount: 3,
      remainingCount: 0,
      cleanup: 'PASS',
      go: true,
    })
    const res = await POST(request({ action: 'cleanup', validationId: id }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.cleanup).toBe('PASS')
    expect(body.createdCount).toBe(3)
    expect(body.deletedCount).toBe(3)
    expect(body.remainingCount).toBe(0)
    expect(r2SelfTest.cleanupR2SelfTest).toHaveBeenCalledTimes(1)
    expect(r2SelfTest.cleanupR2SelfTest).toHaveBeenCalledWith(id)
    expect(r2SelfTest.runR2SelfTest).not.toHaveBeenCalled()
  })

  it('rejects cleanup outside the validation namespace', async () => {
    enableSelfTest()
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
    expect(body.go).toBe(false)
  })

  it('is not referenced by vercel crons or frontend auto-call', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../../../../../vercel.json', import.meta.url), 'utf8')) as {
      crons?: Array<{ path: string }>
    }
    expect((vercel.crons ?? []).some((cron) => cron.path.includes('r2-self-test'))).toBe(false)
    const page = readFileSync(new URL('../../../../admin/video-library/r2-self-test/page.tsx', import.meta.url), 'utf8')
    expect(page).not.toMatch(/useEffect/)
    expect(page).toMatch(/onClick=\{\(\) => void call\('run'\)\}/)
    expect(page).toContain('Validation ID')
    expect(page).toContain('Cleanup Existing Validation')
    expect(page).toContain("call('cleanup', existingId.trim())")
    expect(page).not.toContain('original.mp4')
    expect(page).not.toMatch(/useEffect[\s\S]{0,200}call\('run'\)/)
    const invoke = readFileSync(new URL('../../../../../../scripts/r2-self-test-r4-invoke.mts', import.meta.url), 'utf8')
    expect(invoke).toMatch(/ACTION_REQUIRED/)
    expect(invoke).toMatch(/--action/)
    expect(invoke).not.toMatch(/console\.log\(env/)
    expect(invoke).not.toMatch(/R2_SECRET_ACCESS_KEY\}/)
  })
})
