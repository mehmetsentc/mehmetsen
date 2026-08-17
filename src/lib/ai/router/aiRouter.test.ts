import { afterEach, describe, expect, it, vi } from 'vitest'
import { runProviderChainForTest } from '@/lib/ai/router/aiRouter'
import { resolveProviderChain } from '@/lib/ai/router/policy'
import { shouldSkipRedundantCategoryClassifier } from '@/lib/ai/router/stage3Skip'
import { isMultiProviderEnabled, shouldUseMultiProviderChain } from '@/lib/ai/router/flags'
import { routeClassifierWithProviders } from '@/lib/ai/classifierLlm'
import { groqCohortBucket } from '@/lib/ai/groqRouting'

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

describe('multi-provider chain orchestration', () => {
  it('Groq success does not call Gemini/OpenRouter/DeepSeek', async () => {
    const gemini = vi.fn(async () => VALID)
    const openrouter = vi.fn(async () => VALID)
    const deepseek = vi.fn(async () => VALID)
    const result = await runProviderChainForTest({
      providers: [
        { id: 'groq', call: async () => VALID },
        { id: 'gemini', call: gemini },
        { id: 'openrouter', call: openrouter },
        { id: 'deepseek', call: deepseek },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('groq')
    expect(result.fallback).toBe(false)
    expect(gemini).not.toHaveBeenCalled()
    expect(openrouter).not.toHaveBeenCalled()
    expect(deepseek).not.toHaveBeenCalled()
  })

  it('Groq 429 → Gemini success skips DeepSeek', async () => {
    const deepseek = vi.fn(async () => VALID)
    const result = await runProviderChainForTest({
      providers: [
        {
          id: 'groq',
          call: async () => {
            throw new Error('Groq HTTP 429')
          },
        },
        { id: 'gemini', call: async () => VALID },
        { id: 'deepseek', call: deepseek },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('gemini')
    expect(result.fallback).toBe(true)
    expect(deepseek).not.toHaveBeenCalled()
  })

  it('Groq invalid JSON → Gemini fallback', async () => {
    const result = await runProviderChainForTest({
      providers: [
        { id: 'groq', call: async () => 'not-json' },
        { id: 'gemini', call: async () => VALID },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('gemini')
    expect(result.fallback).toBe(true)
  })

  it('Gemini quota → OpenRouter fallback', async () => {
    const result = await runProviderChainForTest({
      providers: [
        {
          id: 'gemini',
          call: async () => {
            throw new Error('RESOURCE_EXHAUSTED')
          },
        },
        { id: 'openrouter', call: async () => VALID },
        { id: 'deepseek', call: async () => VALID },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('openrouter')
  })

  it('OpenRouter 404 → DeepSeek fallback', async () => {
    const result = await runProviderChainForTest({
      providers: [
        {
          id: 'openrouter',
          call: async () => {
            throw new Error('OpenRouter HTTP 404: model unavailable')
          },
        },
        { id: 'deepseek', call: async () => VALID },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('deepseek')
    expect(result.fallback).toBe(true)
  })

  it('all cheap providers fail → DeepSeek succeeds', async () => {
    const result = await runProviderChainForTest({
      providers: [
        { id: 'groq', call: async () => null },
        { id: 'gemini', call: async () => null },
        { id: 'openrouter', call: async () => null },
        { id: 'deepseek', call: async () => VALID },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('deepseek')
    expect(result.value).toEqual({ categoryId: 'gundem' })
  })

  it('schema validation failure triggers fallback', async () => {
    const result = await runProviderChainForTest({
      providers: [
        { id: 'groq', call: async () => '{"categoryId":"nope","confidence":10}' },
        { id: 'deepseek', call: async () => VALID },
      ],
      validate: parseCategory,
    })
    expect(result.used).toBe('deepseek')
  })

  it('routeClassifierWithProviders still supports Phase 2A Groq→DeepSeek', async () => {
    const result = await routeClassifierWithProviders({
      useGroq: true,
      groq: async () => VALID,
      deepseek: async () => {
        throw new Error('deepseek should not run')
      },
      validate: parseCategory,
    })
    expect(result.used).toBe('groq')
    expect(result.fallback).toBe(false)
  })
})

describe('multi-provider flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to old DeepSeek-only extra chain', () => {
    vi.stubEnv('AI_MULTI_PROVIDER_ENABLED', '')
    vi.stubEnv('AI_MULTI_PROVIDER_PERCENT', '')
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('DEEPSEEK_API_KEY', 'ds')
    expect(isMultiProviderEnabled()).toBe(false)
    expect(shouldUseMultiProviderChain('classification', 'news-1')).toBe(false)
    expect(resolveProviderChain('classification', 'news-1')).toEqual(['deepseek'])
  })

  it('percent 0 keeps extra providers off', () => {
    vi.stubEnv('AI_MULTI_PROVIDER_ENABLED', 'true')
    vi.stubEnv('AI_MULTI_PROVIDER_PERCENT', '0')
    vi.stubEnv('AI_MULTI_PROVIDER_CLASSIFICATION_ENABLED', 'true')
    vi.stubEnv('GEMINI_API_KEY', 'g')
    vi.stubEnv('GEMINI_FAST_MODEL', 'gemini-flash-lite')
    vi.stubEnv('DEEPSEEK_API_KEY', 'ds')
    expect(shouldUseMultiProviderChain('classification', 'news-1')).toBe(false)
    expect(resolveProviderChain('classification', 'news-1')).toEqual(['deepseek'])
  })

  it('skips Gemini/OpenRouter when keys or models are missing', () => {
    vi.stubEnv('AI_MULTI_PROVIDER_ENABLED', 'true')
    vi.stubEnv('AI_MULTI_PROVIDER_PERCENT', '100')
    vi.stubEnv('AI_MULTI_PROVIDER_CLASSIFICATION_ENABLED', 'true')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('OPENROUTER_FAST_MODEL', '')
    vi.stubEnv('DEEPSEEK_API_KEY', 'ds')
    expect(resolveProviderChain('classification', 'x')).toEqual(['deepseek'])
  })

  it('uses a stable canary bucket', () => {
    expect(groqCohortBucket('queue-abc')).toBe(groqCohortBucket('queue-abc'))
  })
})

describe('stage3 redundant classifier skip', () => {
  it('skips only high-confidence non-generic results with location+tags', () => {
    expect(
      shouldSkipRedundantCategoryClassifier({
        categoryId: 'siyaset',
        confidence: 88,
        country: 'Türkiye',
        tags: ['ankara'],
      })
    ).toBe(true)
    expect(
      shouldSkipRedundantCategoryClassifier({
        categoryId: 'yerel-haber',
        confidence: 99,
        country: 'Türkiye',
        tags: ['bursa'],
      })
    ).toBe(false)
    expect(
      shouldSkipRedundantCategoryClassifier({
        categoryId: 'siyaset',
        confidence: 50,
        country: 'Türkiye',
        tags: ['ankara'],
      })
    ).toBe(false)
  })
})
