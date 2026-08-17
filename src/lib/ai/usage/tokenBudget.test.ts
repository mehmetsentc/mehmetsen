import { afterEach, describe, expect, it, vi } from 'vitest'
import { inputCharLimit, optionalOutputTokenLimit, outputTokenLimit } from '@/lib/ai/usage/tokenBudget'

describe('token budgets', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('preserves current limits when ENV is absent', () => {
    vi.stubEnv('AI_STAGE1_MAX_INPUT_CHARS', '')
    vi.stubEnv('AI_STAGE1_MAX_OUTPUT_TOKENS', '')
    expect(inputCharLimit('AI_STAGE1_MAX_INPUT_CHARS', 6000)).toBe(6000)
    expect(outputTokenLimit('AI_STAGE1_MAX_OUTPUT_TOKENS', 3500)).toBe(3500)
    expect(optionalOutputTokenLimit('AI_STAGE3_MAX_OUTPUT_TOKENS')).toBeNull()
  })

  it('applies a positive ENV override', () => {
    vi.stubEnv('AI_STAGE1_MAX_INPUT_CHARS', '1200')
    vi.stubEnv('AI_STAGE3_MAX_OUTPUT_TOKENS', '200')
    expect(inputCharLimit('AI_STAGE1_MAX_INPUT_CHARS', 6000)).toBe(1200)
    expect(optionalOutputTokenLimit('AI_STAGE3_MAX_OUTPUT_TOKENS')).toBe(200)
  })

  it('ignores invalid ENV and keeps fallback', () => {
    vi.stubEnv('AI_CHIEF_MAX_INPUT_CHARS', 'nope')
    vi.stubEnv('AI_CHIEF_MAX_OUTPUT_TOKENS', '0')
    expect(inputCharLimit('AI_CHIEF_MAX_INPUT_CHARS', 3500)).toBe(3500)
    expect(outputTokenLimit('AI_CHIEF_MAX_OUTPUT_TOKENS', 1800)).toBe(1800)
  })
})
