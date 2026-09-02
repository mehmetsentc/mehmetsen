import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('@/services/crawler/automatedAiPolicy', () => ({
  isManualEditorAiEnabled: vi.fn(),
}))

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn().mockResolvedValue({ uid: 'admin', role: 'managing_editor' }),
}))

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn().mockReturnValue(true),
}))

vi.mock('@/services/crawler/store/drizzle', () => ({
  DrizzleCrawlerStore: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/services/crawler/editorial/aiEnqueue', () => ({
  AI_ENQUEUE_BATCH_CAP: 200,
  enqueueRawArticlesForAi: vi.fn().mockResolvedValue({ requested: 1, enqueued: 1, skipped: 0 }),
}))

import { isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'

describe('P17.12D ai-enqueue route', () => {
  beforeEach(() => {
    vi.mocked(isManualEditorAiEnabled).mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('enqueues when manual editor AI is enabled', async () => {
    const { enqueueRawArticlesForAi } = await import('@/services/crawler/editorial/aiEnqueue')
    const res = await POST(
      new Request('http://localhost/api/admin/crawler/articles/ai-enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ ids: ['raw_1'] }),
      })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.enqueued).toBe(1)
    expect(enqueueRawArticlesForAi).toHaveBeenCalled()
  })

  it('returns 403 when manual editor AI is disabled', async () => {
    vi.mocked(isManualEditorAiEnabled).mockReturnValue(false)
    const { enqueueRawArticlesForAi } = await import('@/services/crawler/editorial/aiEnqueue')
    const res = await POST(
      new Request('http://localhost/api/admin/crawler/articles/ai-enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ ids: ['raw_1'] }),
      })
    )
    expect(res.status).toBe(403)
    expect(enqueueRawArticlesForAi).not.toHaveBeenCalled()
  })

  it('accepts 25 human-selected ids for queue (under AI_ENQUEUE_BATCH_CAP)', async () => {
    const { enqueueRawArticlesForAi } = await import('@/services/crawler/editorial/aiEnqueue')
    vi.mocked(enqueueRawArticlesForAi).mockResolvedValueOnce({
      requested: 25,
      enqueued: 25,
      skipped: 0,
    })
    const ids = Array.from({ length: 25 }, (_, i) => `raw_${i}`)
    const res = await POST(
      new Request('http://localhost/api/admin/crawler/articles/ai-enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ ids }),
      })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.requested).toBe(25)
    expect(body.enqueued).toBe(25)
    expect(enqueueRawArticlesForAi).toHaveBeenCalledWith(expect.anything(), ids)
  })
})
