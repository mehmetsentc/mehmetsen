import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  groqCohortBucket,
  isGroqClassifiersEnabled,
  getGroqPercent,
  isInGroqPercent,
  shouldUseGroqClassifier,
} from '@/lib/ai/groqRouting'

describe('groq classifier routing flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to disabled and 0 percent', () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', '')
    vi.stubEnv('AI_GROQ_PERCENT', '')
    vi.stubEnv('GROQ_API_KEY', '')
    expect(isGroqClassifiersEnabled()).toBe(false)
    expect(getGroqPercent()).toBe(0)
    expect(shouldUseGroqClassifier('news-1')).toBe(false)
  })

  it('does not use Groq when the API key is missing', () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'true')
    vi.stubEnv('AI_GROQ_PERCENT', '100')
    vi.stubEnv('GROQ_API_KEY', '')
    expect(shouldUseGroqClassifier('news-1')).toBe(false)
  })

  it('does not use Groq when percent is 0', () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'true')
    vi.stubEnv('AI_GROQ_PERCENT', '0')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    expect(shouldUseGroqClassifier('news-1')).toBe(false)
  })

  it('uses Groq for eligible calls at 100 percent', () => {
    vi.stubEnv('AI_GROQ_CLASSIFIERS_ENABLED', 'true')
    vi.stubEnv('AI_GROQ_PERCENT', '100')
    vi.stubEnv('GROQ_API_KEY', 'gsk-test')
    expect(shouldUseGroqClassifier('news-1')).toBe(true)
  })

  it('uses a stable hash cohort, not Math.random', () => {
    const a = groqCohortBucket('queue-abc')
    const b = groqCohortBucket('queue-abc')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(100)
    expect(isInGroqPercent('queue-abc', 0)).toBe(false)
    expect(isInGroqPercent('queue-abc', 100)).toBe(true)
    const inTen = isInGroqPercent('queue-abc', 10)
    expect(inTen).toBe(groqCohortBucket('queue-abc') < 10)
  })
})
