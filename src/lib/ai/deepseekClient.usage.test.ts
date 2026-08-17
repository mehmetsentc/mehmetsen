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

describe('deepseekChatCompletion usage contract', () => {
  beforeEach(() => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
    recordAiRequestUsage.mockReset()
    recordAiRequestUsage.mockImplementation(() => {
      throw new Error('Firestore telemetry failed')
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('still returns a string when telemetry throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
          }),
          { status: 200 }
        )
      )
    )
    const { deepseekChatCompletion } = await import('@/lib/ai/deepseekClient')
    const result = await deepseekChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
      disableThinking: true,
    })
    expect(typeof result).toBe('string')
    expect(result).toBe('{"ok":true}')
    expect(result).not.toMatchObject({ data: expect.anything() } as never)
  })

  it('records a failure event on HTTP 500 without adding extra retries', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    recordAiRequestUsage.mockImplementation(() => undefined)
    const { deepseekChatCompletion } = await import('@/lib/ai/deepseekClient')
    await expect(
      deepseekChatCompletion({
        messages: [{ role: 'user', content: 'hi' }],
        jsonMode: false,
      })
    ).rejects.toThrow(/DeepSeek HTTP 500/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(recordAiRequestUsage).toHaveBeenCalledTimes(1)
    expect(recordAiRequestUsage.mock.calls[0]?.[0]).toMatchObject({
      success: false,
      statusCode: 500,
      attempt: 1,
    })
  })

  it('distinguishes retry attempts without changing retry policy', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          }),
          { status: 200 }
        )
      )
    vi.stubGlobal('fetch', fetchMock)
    recordAiRequestUsage.mockImplementation(() => undefined)
    const { deepseekChatCompletionWithRetry } = await import('@/lib/ai/deepseekClient')
    const pending = deepseekChatCompletionWithRetry({
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
    })
    await vi.advanceTimersByTimeAsync(2500)
    const result = await pending
    expect(result).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recordAiRequestUsage).toHaveBeenCalledTimes(2)
    expect(recordAiRequestUsage.mock.calls[0]?.[0]).toMatchObject({ success: false, statusCode: 429, attempt: 1 })
    expect(recordAiRequestUsage.mock.calls[1]?.[0]).toMatchObject({ success: true, attempt: 2 })
  })
})
