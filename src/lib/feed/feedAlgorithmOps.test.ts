import { describe, expect, it } from 'vitest'
import {
  defaultFeedAlgorithmOps,
  normalizeBoostTopic,
  sanitizeFeedAlgorithmOps,
} from '@/lib/feed/feedAlgorithmOps'

describe('feedAlgorithmOps', () => {
  it('defaults live off and empty editorial fields', () => {
    expect(defaultFeedAlgorithmOps()).toEqual({
      liveEnabled: false,
      instructions: '',
      boostTopics: [],
      updatedAt: null,
      updatedBy: null,
    })
  })

  it('normalizes topics and drops junk', () => {
    expect(normalizeBoostTopic('  Ekonomi ')).toBe('ekonomi')
    expect(normalizeBoostTopic('#Deprem')).toBe('deprem')
    expect(normalizeBoostTopic('x')).toBeNull()
    expect(normalizeBoostTopic('<script>')).toBeNull()
  })

  it('sanitizes live flag, instruction cap, unique topics', () => {
    const clean = sanitizeFeedAlgorithmOps({
      liveEnabled: true,
      instructions: '  Yerel yangını öne çıkar.  ',
      boostTopics: ['Ekonomi', 'ekonomi', 'x', 'Euro 2028', 12 as unknown as string],
    })
    expect(clean.liveEnabled).toBe(true)
    expect(clean.instructions).toBe('Yerel yangını öne çıkar.')
    expect(clean.boostTopics).toEqual(['ekonomi', 'euro 2028'])
  })
})
