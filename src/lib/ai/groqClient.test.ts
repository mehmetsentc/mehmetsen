import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const recordAiRequestUsage = vi.fn()

vi.mock('@/lib/ai/usage/telemetry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/usage/telemetry')>(
    '@/lib/ai/usage/telemetry'
  )
  return {
    ...actual,
    recordAiRequestUsage: (...args: unknown[]) => recordAiRequestUsage(...args),
  }
})

describe('groqChatCompletion', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'gsk-test-key')
    vi.stubEnv('GROQ_FAST_MODEL', 'openai/gpt-oss-20b')
    recordAiRequestUsage.mockReset()
    recordAiRequestUsage.mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns a string and records provider=groq on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
            }),
            { status: 200 }
          )
      )
    )
    const { groqChatCompletion } = await import('@/lib/ai/groqClient')
    const result = await groqChatCompletion({
      messages: [{ role: 'user', content: 'secret-prompt' }],
      telemetry: { agentName: 'category_classifier', operation: 'classify_category' },
    })
    expect(result).toBe('{"ok":true}')
    expect(recordAiRequestUsage).toHaveBeenCalledTimes(1)
    expect(recordAiRequestUsage.mock.calls[0]?.[0]).toMatchObject({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      success: true,
      statusCode: 200,
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    })
    const dumped = JSON.stringify(recordAiRequestUsage.mock.calls[0]?.[0])
    expect(dumped).not.toContain('gsk-test-key')
    expect(dumped).not.toContain('secret-prompt')
  })

  it('records HTTP 429 without extra retries', async () => {
    const fetchMock = vi.fn(async () => new Response('rate', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    const { groqChatCompletion } = await import('@/lib/ai/groqClient')
    await expect(
      groqChatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/Groq HTTP 429/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(recordAiRequestUsage.mock.calls[0]?.[0]).toMatchObject({
      provider: 'groq',
      success: false,
      statusCode: 429,
    })
  })

  it('throws when GROQ_API_KEY is missing and does not fetch', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { groqChatCompletion } = await import('@/lib/ai/groqClient')
    await expect(
      groqChatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/GROQ_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
