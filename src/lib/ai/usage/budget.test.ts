import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDailyDeepSeekTokenWarning } from '@/lib/ai/usage/budget'

describe('getDailyDeepSeekTokenWarning', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is inactive when unset', () => {
    vi.stubEnv('AI_DAILY_DEEPSEEK_TOKEN_WARNING', '')
    expect(getDailyDeepSeekTokenWarning()).toBeNull()
  })

  it('parses a positive integer threshold', () => {
    vi.stubEnv('AI_DAILY_DEEPSEEK_TOKEN_WARNING', '500000')
    expect(getDailyDeepSeekTokenWarning()).toBe(500000)
  })
})
