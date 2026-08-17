import { describe, expect, it } from 'vitest'
import { parseDeepSeekUsage } from '@/lib/ai/usage/parseUsage'

describe('parseDeepSeekUsage', () => {
  it('normalizes prompt/completion/total tokens', () => {
    expect(
      parseDeepSeekUsage({
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
      })
    ).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
    })
  })

  it('captures cache fields when present', () => {
    expect(
      parseDeepSeekUsage({
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
      })
    ).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
      cacheHitTokens: 800,
      cacheMissTokens: 200,
    })
  })

  it('leaves missing cache fields undefined instead of 0', () => {
    const usage = parseDeepSeekUsage({
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
    })
    expect(usage?.cacheHitTokens).toBeUndefined()
    expect(usage?.cacheMissTokens).toBeUndefined()
  })

  it('returns undefined for missing usage object', () => {
    expect(parseDeepSeekUsage(undefined)).toBeUndefined()
    expect(parseDeepSeekUsage(null)).toBeUndefined()
    expect(parseDeepSeekUsage({})).toBeUndefined()
  })

  it('does not coerce NaN or negative values to 0', () => {
    expect(parseDeepSeekUsage({ prompt_tokens: Number.NaN, completion_tokens: -1 })).toBeUndefined()
  })
})
