import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdate = vi.fn().mockResolvedValue(undefined)

function publishedDocNeedingSeo() {
  return {
    id: 'news_test_1',
    data: () => ({
      status: 'published',
      title: 'Test haber başlığı',
      content: 'Uzun haber içeriği metni burada yer alıyor.',
      summary: 'Kısa özet',
      seoTitle: '',
      seoDescription: '',
    }),
    ref: { update: mockUpdate },
  }
}

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            get: async () => ({ docs: [publishedDocNeedingSeo()] }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/ai/deepseekClient', () => ({
  recordDirectDeepSeekObservation: vi.fn(),
}))

describe('P17.12 SEO backfill manual_editor gate', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockUpdate.mockClear()
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    global.fetch = originalFetch
  })

  async function runBackfill(flag: string | undefined) {
    vi.resetModules()
    if (flag === undefined) {
      delete process.env.MANUAL_EDITOR_AI_ENABLED
    } else {
      vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', flag)
    }
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  seoTitle: 'Test SEO başlık yeterince uzun',
                  seoDescription: 'Test SEO açıklama metni yeterince uzun olmalı.',
                  seoKeywords: ['test'],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    )
    global.fetch = fetchMock

    const { backfillArticleSeo } = await import('@/lib/seoBackfill')
    const result = await backfillArticleSeo(5)
    return { fetchMock, result }
  }

  it('MANUAL missing → zero provider calls', async () => {
    const { fetchMock, result } = await runBackfill(undefined)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.updated).toBe(0)
    expect(result.errors).toBeGreaterThan(0)
  })

  it('MANUAL false → zero provider calls', async () => {
    const { fetchMock, result } = await runBackfill('false')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.updated).toBe(0)
    expect(result.errors).toBeGreaterThan(0)
  })

  it('MANUAL true → reaches mocked provider boundary', async () => {
    const { fetchMock, result } = await runBackfill('true')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('api.deepseek.com')
    expect(result.updated).toBe(1)
  })
})
