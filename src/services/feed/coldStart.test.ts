/**
 * Phase P6 Cold Start V2 tests — unit/logic (no live DB).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isColdStartV2Enabled } from '@/lib/feed/featureFlag'
import { feedColdStartService } from '@/services/feed/FeedColdStartService'
import type { FeedUserContext } from '@/types/smartFeed'

function ctx(partial: Partial<FeedUserContext> = {}): FeedUserContext {
  return {
    userId: null,
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: null,
    districtSlug: null,
    ...partial,
  }
}

describe('P6 cold start feature flag', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env }
  })
  afterEach(() => {
    process.env = env
  })
  it('cold start on by default in prod', () => {
    delete process.env.COLD_START_V2_ENABLED
    expect(isColdStartV2Enabled()).toBe(true)
  })
  it('cold start responds to disable flag', () => {
    process.env.COLD_START_V2_ENABLED = 'false'
    expect(isColdStartV2Enabled()).toBe(false)
  })
})

describe('P6 cold start profiles', () => {
  it('guest when no userId', () => {
    expect(feedColdStartService.resolveProfile(ctx())).toBe('GUEST')
  })

  it('new user when authed but zero signals', () => {
    expect(feedColdStartService.resolveProfile(ctx({ userId: 'u1' }))).toBe('NEW_USER')
  })

  it('light user when few signals', () => {
    const light = ctx({
      userId: 'u1',
      explicitInterests: ['spor'],
      behavioralInterests: new Map([['spor', 0.2]]),
    })
    expect(feedColdStartService.resolveProfile(light)).toBe('LIGHT_USER')
  })

  it('null when enough signals', () => {
    const heavy = ctx({
      userId: 'u1',
      explicitInterests: ['spor', 'ekonomi'],
      behavioralInterests: new Map([
        ['spor', 0.8],
        ['ekonomi', 0.6],
        ['gundem', 0.4],
      ]),
      followedPublisherIds: new Set(['p1']),
    })
    expect(feedColdStartService.resolveProfile(heavy)).toBeNull()
  })
})

describe('P6 cold start onboarding boost', () => {
  it('boosts city-matching articles', () => {
    const scored = feedColdStartService.applyOnboardingBoost(
      [
        {
          articleId: 'a1',
          clusterId: null,
          publisherId: null,
          publisherSlug: null,
          publisherName: null,
          publisherLogoUrl: null,
          headline: 'İstanbul trafiği',
          summary: null,
          category: 'gundem',
          image: null,
          video: null,
          publishedAt: new Date(),
          updatedAt: new Date(),
          breaking: false,
          materialUpdate: false,
          clusterSourceCount: 1,
          citySlug: 'istanbul',
          likesCount: 0,
          commentsCount: 0,
          savesCount: 0,
          sharesCount: 0,
          slug: 'istanbul-trafik',
          source: 'RECENT',
          sortScore: 1,
          score: 0.5,
          reason: 'RECENT',
          breakdown: {
            following: 0,
            freshness: 0.5,
            interest: 0,
            local: 0,
            editorial: 0,
            quality: 0,
            engagement: 0,
            discovery: 0,
            featured: 0,
            popularity: 0,
            materialUpdate: 0,
            penalties: 0,
            total: 0.5,
          },
        },
      ],
      ctx({ userId: 'u1', city: 'istanbul', explicitInterests: ['gundem'] })
    )
    expect(scored[0].score).toBeGreaterThan(0.5)
  })
})
