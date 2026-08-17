import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeClassifierJson, routeClassifierWithProviders } from '@/lib/ai/classifierLlm'

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

const VALID = '{"categoryId":"gundem","confidence":90,"reason":"ok"}'

function parseCategory(raw: string): { categoryId: string } | null {
  try {
    const parsed = JSON.parse(raw) as { categoryId?: string; confidence?: number }
    if (!parsed.categoryId || Number(parsed.confidence ?? 0) < 75) return null
    return { categoryId: parsed.categoryId }
  } catch {
    return null
  }
}

function groqResponse(content: string, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 },
    }),
    { status }
  )
}

function deepseekResponse(content: string, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
    }),
    { status }
  )
}

describe('routeClassifierWithProviders', () => {
  it('uses Groq on success', async () => {
    const result = await routeClassifierWithProviders({
      useGroq: true,
      groq: async () => VALID,
      deepseek: async () => {
        throw new Error('deepseek should not run')
      },
      validate: parseCategory,
    })
    expect(result).toEqual({ value: { categoryId: 'gundem' }, used: 'groq', fallback: false })
  })

  it('falls back to DeepSeek on Groq timeout / empty / invalid JSON', async () => {
    const timeout = await routeClassifierWithProviders({
      useGroq: true,
      groq: async () => {
        throw new Error('timeout')
      },
      deepseek: async () => VALID,
      validate: parseCategory,
    })
    expect(timeout.used).toBe('deepseek')
    expect(timeout.fallback).toBe(true)

    const invalid = await routeClassifierWithProviders({
      useGroq: true,
      groq: async () => 'not-json',
      deepseek: async () => VALID,
      validate: parseCategory,
    })
    expect(invalid.used).toBe('deepseek')
    expect(invalid.fallback).toBe(true)
  })

  it('stays on DeepSeek when Groq is not selected', async () => {
    const result = await routeClassifierWithProviders({
      useGroq: false,
      groq: async () => VALID,
      deepseek: async () => VALID,
      validate: parseCategory,
    })
    expect(result).toEqual({ value: { categoryId: 'gundem' }, used: 'deepseek', fallback: false })
  })
})

describe('completeClassifierJson', () => {
  beforeEach(() => {
    recordAiRequestUsage.mockReset()
    recordAiRequestUsage.mockImplementation(() => undefined)
    vi.stubEnv('DEEPSEEK_API_KEY', 'ds-test')
    vi.stubEnv('DEEPSEEK_NEWS_MODEL', 'deepseek-v4-flash')
    vi.stubEnv('GROQ_FAST_MODEL', 'openai/gpt-oss-20b')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const meta = {
    agentName: 'category_classifier',
    operation: 'classify_category',
    promptVersion: 'news-classifier:v1',
    system: 'sys',
    user: 'user-prompt-secret',
    cohortKey: 'news-stable-1',
  }

  function enableGroq(percent = '100') {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'true')
    vi.stubEnv('AI_GROQ_PERCENT', percent)
    vi.stubEnv('GROQ_API_KEY', 'gsk-test-key')
  }

  it('uses Groq result when Groq succeeds', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) return groqResponse(VALID)
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const value = await completeClassifierJson(meta, parseCategory)
    expect(value).toEqual({ categoryId: 'gundem' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('groq.com')
    const groqEvents = recordAiRequestUsage.mock.calls
      .map((c) => c[0] as { provider?: string; success?: boolean; model?: string })
      .filter((e) => e.provider === 'groq')
    expect(groqEvents.some((e) => e.success === true && e.model === 'openai/gpt-oss-20b')).toBe(true)
  })

  it('falls back to DeepSeek on Groq 429', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) return new Response('rate', { status: 429 })
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    const value = await completeClassifierJson(meta, parseCategory)
    expect(value).toEqual({ categoryId: 'gundem' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const events = recordAiRequestUsage.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(events.some((e) => e.provider === 'groq' && e.success === false && e.statusCode === 429)).toBe(
      true
    )
    expect(events.some((e) => e.provider === 'deepseek' && e.success === true && e.attempt === 2)).toBe(
      true
    )
  })

  it('falls back to DeepSeek on Groq 500', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) return new Response('err', { status: 500 })
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    await completeClassifierJson(meta, parseCategory)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to DeepSeek on Groq timeout', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    const value = await completeClassifierJson(meta, parseCategory)
    expect(value).toEqual({ categoryId: 'gundem' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to DeepSeek on invalid JSON', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) return groqResponse('not-json')
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    const value = await completeClassifierJson(meta, parseCategory)
    expect(value).toEqual({ categoryId: 'gundem' })
    const events = recordAiRequestUsage.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(events.some((e) => e.provider === 'groq' && e.errorCode === 'invalid_json')).toBe(true)
    expect(events.some((e) => e.provider === 'deepseek' && e.attempt === 2)).toBe(true)
  })

  it('uses DeepSeek when GROQ_API_KEY is missing', async () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'true')
    vi.stubEnv('AI_GROQ_PERCENT', '100')
    vi.stubEnv('GROQ_API_KEY', '')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) throw new Error('groq should not run')
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    const value = await completeClassifierJson(meta, parseCategory)
    expect(value).toEqual({ categoryId: 'gundem' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('deepseek.com')
  })

  it('uses DeepSeek when the feature flag is false', async () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'false')
    vi.stubEnv('AI_GROQ_PERCENT', '100')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test-key')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => deepseekResponse(VALID))
    vi.stubGlobal('fetch', fetchMock)
    await completeClassifierJson(meta, parseCategory)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('deepseek.com')
  })

  it('uses DeepSeek when percent is 0', async () => {
    enableGroq('0')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => deepseekResponse(VALID))
    vi.stubGlobal('fetch', fetchMock)
    await completeClassifierJson(meta, parseCategory)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('deepseek.com')
  })

  it('does not write prompt, content, or API keys into telemetry', async () => {
    enableGroq()
    const fetchMock = vi.fn(async () => groqResponse(VALID))
    vi.stubGlobal('fetch', fetchMock)
    await completeClassifierJson(meta, parseCategory)
    const dumped = JSON.stringify(recordAiRequestUsage.mock.calls)
    expect(dumped).not.toContain('gsk-test-key')
    expect(dumped).not.toContain('user-prompt-secret')
    expect(dumped).not.toContain('ds-test')
    expect(dumped).not.toMatch(/"prompt"\s*:/)
  })

  it('does not add a retry storm — one Groq attempt then one DeepSeek fallback', async () => {
    enableGroq()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('groq.com')) return new Response('err', { status: 500 })
      return deepseekResponse(VALID)
    })
    vi.stubGlobal('fetch', fetchMock)
    await completeClassifierJson(meta, parseCategory)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('groq.com'))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('deepseek.com'))).toHaveLength(1)
  })
})
