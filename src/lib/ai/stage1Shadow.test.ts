import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isStage1ShadowEnabled,
  runStage1Shadow,
  shadowMustNotPublish,
  shouldRunStage1Shadow,
} from '@/lib/ai/stage1Shadow'

vi.mock('@/lib/ai/groqClient', () => ({
  groqChatCompletionDetailed: vi.fn(async () => ({
    text: '{"title":"Shadow title","spot":"s","summary":"sum","content":"body","seoTitle":"seo","seoDescription":"desc"}',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    latencyMs: 12,
    statusCode: 200,
    model: 'openai/gpt-oss-20b',
  })),
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
})
