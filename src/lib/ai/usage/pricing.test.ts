import { afterEach, describe, expect, it, vi } from 'vitest'
import { estimateUsageCost, getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'

describe('AI usage pricing', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('leaves estimated cost undefined when rates are missing', () => {
    vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '')
    vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '')
    const pricing = getDeepSeekPricing('deepseek-v4-flash')
    const cost = estimateUsageCost(
      { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
      pricing
    )
    expect(cost.estimatedInputCostUsd).toBeUndefined()
    expect(cost.estimatedOutputCostUsd).toBeUndefined()
    expect(cost.estimatedTotalCostUsd).toBeUndefined()

    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'generate_article',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
    })
    expect(doc.inputTokens).toBe(1000)
    expect(doc.outputTokens).toBe(200)
    expect(doc.estimatedTotalCostUsd).toBeUndefined()
  })

  it('computes cost only from env rates', () => {
    vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.14')
    vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '0.28')
    const cost = estimateUsageCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      getDeepSeekPricing('deepseek-v4-flash')
    )
    expect(cost.estimatedInputCostUsd).toBeCloseTo(0.14)
    expect(cost.estimatedOutputCostUsd).toBeCloseTo(0.28)
    expect(cost.estimatedTotalCostUsd).toBeCloseTo(0.42)
  })
})
