import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isStage1ShadowEnabled,
  resolveGroqShadowModel,
  resolveStage1ShadowProvider,
  runStage1Shadow,
  shadowMustNotPublish,
  shouldRunStage1Shadow,
} from '@/lib/ai/stage1Shadow'
import { groqCohortBucket } from '@/lib/ai/groqRouting'
import { STAGE1_RETRY_AUDIT } from '@/lib/ai/usage/generationReason'

vi.mock('@/lib/ai/groqClient', () => ({
  groqChatCompletionDetailed: vi.fn(async () => ({
    text: '{"title":"Shadow title","spot":"s","summary":"sum","content":"body","seoTitle":"seo","seoDescription":"desc"}',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    latencyMs: 12,
    statusCode: 200,
    model: 'openai/gpt-oss-20b',
  })),
}))

vi.mock('@/lib/ai/providers/openrouter', () => ({
  openRouterFastChat: vi.fn(async () => {
    throw new Error('openrouter should be skipped when groq is available')
  }),
}))

vi.mock('@/lib/ai/providers/geminiChat', () => ({
  geminiFastChat: vi.fn(async () => {
    throw new Error('gemini should be skipped when groq is available')
  }),
}))

describe('Stage1 shadow mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled by default', () => {
    vi.stubEnv('AI_STAGE1_SHADOW_ENABLED', '')
    vi.stubEnv('AI_STAGE1_SHADOW_PERCENT', '')
    expect(isStage1ShadowEnabled()).toBe(false)
    expect(shouldRunStage1Shadow('any')).toBe(false)
  })

  it('stays off when enabled but percent is 0', () => {
    vi.stubEnv('AI_STAGE1_SHADOW_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_SHADOW_PERCENT', '0')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    expect(isStage1ShadowEnabled()).toBe(false)
    expect(shouldRunStage1Shadow('queue-1')).toBe(false)
  })

  it('skips Groq when GROQ_API_KEY is missing', () => {
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('GROQ_STRONG_MODEL', 'openai/gpt-oss-120b')
    expect(resolveGroqShadowModel()).toBeNull()
  })

  it('skips OpenRouter and Gemini when their ENVs are missing', () => {
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('OPENROUTER_FAST_MODEL', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('GEMINI_FAST_MODEL', '')
    expect(resolveStage1ShadowProvider()).toBeNull()
  })

  it('prefers Groq strong/fast over OpenRouter and Gemini', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    vi.stubEnv('GROQ_STRONG_MODEL', 'openai/gpt-oss-120b')
    vi.stubEnv('OPENROUTER_API_KEY', 'or-test')
    vi.stubEnv('OPENROUTER_FAST_MODEL', 'meta-llama/llama-3.1-8b-instruct')
    vi.stubEnv('GEMINI_API_KEY', 'gem-test')
    vi.stubEnv('GEMINI_FAST_MODEL', 'gemini-2.5-flash-lite')
    expect(resolveStage1ShadowProvider()).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    })
  })

  it('uses deterministic SHA-256 cohort (newsId/queueId/traceId)', () => {
    vi.stubEnv('AI_STAGE1_SHADOW_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_SHADOW_PERCENT', '10')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    const a = shouldRunStage1Shadow('news-abc')
    const b = shouldRunStage1Shadow('news-abc')
    expect(a).toBe(b)
    expect(groqCohortBucket('news-abc')).toBe(groqCohortBucket('news-abc'))
  })

  it('never publishes the shadow result', () => {
    expect(shadowMustNotPublish()).toBe(true)
  })

  it('returns null even when a cheap provider would succeed', async () => {
    vi.stubEnv('AI_STAGE1_SHADOW_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_SHADOW_PERCENT', '100')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    const result = await runStage1Shadow({
      messages: [{ role: 'user', content: 'x' }],
      cohortKey: 'shadow-test',
    })
    expect(result).toBeNull()
  })

  it('documents that pipeline_retry is never assigned', () => {
    expect(STAGE1_RETRY_AUDIT.pipeline_retry.assignedIn).toBeNull()
    expect(STAGE1_RETRY_AUDIT.continuation.likelyOverfire).toBe(true)
    expect(STAGE1_RETRY_AUDIT.quality_retry.duplicatesStage1).toBe(true)
  })
})
