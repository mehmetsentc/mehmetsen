import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyGeminiError } from '@/lib/ai/router/validation'
import { isGeminiCircuitOpen, openGeminiCircuit, resetGeminiCircuit } from '@/lib/ai/providers/geminiCircuit'
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { getOpenRouterReadiness } from '@/lib/ai/router/policy'

describe('Gemini error taxonomy', () => {
  it('maps 429/quota to quota_429', () => {
    expect(classifyGeminiError(429, 'Gemini HTTP 429')).toBe('quota_429')
    expect(classifyGeminiError(undefined, 'RESOURCE_EXHAUSTED')).toBe('quota_429')
  })

  it('maps auth and invalid model', () => {
    expect(classifyGeminiError(401, 'Gemini HTTP 401')).toBe('auth')
    expect(classifyGeminiError(404, 'NOT_FOUND')).toBe('invalid_model')
  })
})

describe('Gemini fail-fast circuit', () => {
  afterEach(() => {
    resetGeminiCircuit()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('opens after quota and skips further Gemini in-process', () => {
    expect(isGeminiCircuitOpen()).toBe(false)
    openGeminiCircuit(60_000)
    expect(isGeminiCircuitOpen()).toBe(true)
  })

  it('Gemini 429 is quota_429, one fetch, no retry', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('GEMINI_FAST_MODEL', 'gemini-2.5-flash')
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      geminiFastChat({
        messages: [{ role: 'user', content: '{}' }],
        temperature: 0.1,
        maxTokens: 200,
        timeoutMs: 5_000,
        jsonMode: true,
      })
    ).rejects.toThrow(/429/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(isGeminiCircuitOpen()).toBe(true)

    await expect(
      geminiFastChat({
        messages: [{ role: 'user', content: '{}' }],
        temperature: 0.1,
        maxTokens: 200,
        timeoutMs: 5_000,
        jsonMode: true,
      })
    ).rejects.toThrow(/circuit/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('OpenRouter readiness', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not invent a model when FAST_MODEL is missing', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'or-test')
    vi.stubEnv('OPENROUTER_FAST_MODEL', '')
    const ready = getOpenRouterReadiness()
    expect(ready.apiKeyDefined).toBe(true)
    expect(ready.fastModelDefined).toBe(false)
    expect(ready.available).toBe(false)
  })
})
