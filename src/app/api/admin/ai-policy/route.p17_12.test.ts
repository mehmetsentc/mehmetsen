import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { GET } from './route'

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn(),
}))

describe('P17.12 /api/admin/ai-policy diagnostic', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(verifyCmsToken).mockReset()
  })

  it('returns booleans only — no raw env or secrets', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({ uid: 'u1', role: 'admin' } as any)
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    vi.stubEnv('DEEPSEEK_API_KEY', 'super-secret-key')
    vi.stubEnv('CRON_SECRET', 'super-secret-cron')

    const res = await GET(new Request('http://localhost/api/admin/ai-policy'))
    const body = await res.json()
    const serialized = JSON.stringify(body)

    expect(res.status).toBe(200)
    expect(body).toEqual({
      crawlerAiDispatchEnabled: false,
      legacyDirectAiEnabled: false,
      manualEditorAiEnabled: true,
      automatedCrawlerMayUseAi: false,
      legacyMayUseAi: false,
      manualEditorMayUseAi: true,
    })
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toMatch(/DEEPSEEK|CRON_SECRET|process\.env/)
  })

  it('requires CMS auth', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/admin/ai-policy'))
    expect(res.status).toBe(401)
  })
})
