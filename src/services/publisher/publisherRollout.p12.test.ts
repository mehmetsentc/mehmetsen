/**
 * Phase P12 — First Real Publisher Controlled Pilot Unit Tests
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  ALLOWLISTABLE_FEATURES,
  FEATURE_ENV_KEYS,
  resolveFeatureForPublisher,
  validateAllowlistGrant,
} from '@/lib/publisher/rolloutMatrix'
import { evaluatePublisherSeo } from '@/lib/seo/seoEligibility'
import { serializePublicPublisher } from '@/lib/publisher/public'
import { buildPublisherAdMediaKey, buildPublisherContentMediaKey } from '@/lib/storage'
import type { PublisherRecord } from '@/types/publisher'

const FLAG_KEYS = Object.values(FEATURE_ENV_KEYS)

describe('Phase P12 — Real Publisher Controlled Rollout Matrix', () => {
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      prev[k] = process.env[k]
      process.env[k] = 'false'
    }
  })

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })

  it('allows pilot bundle for real publisher via allowlist when global flags are false', () => {
    const allowlisted = new Set([
      'PLATFORM',
      'STUDIO',
      'PROFILE_COMPOSER',
      'CONTENT_STUDIO',
      'MANUAL_PUBLISH',
      'MEDIA_UPLOAD',
      'AD_INVENTORY',
      'SELF_MANAGED_ADS',
      'AD_SERVING',
      'AD_ANALYTICS',
      'PROFILE_AD_SLOTS',
      'ARTICLE_AD_SLOTS',
    ])

    const platform = resolveFeatureForPublisher({
      featureKey: 'PLATFORM',
      allowlistedKeys: allowlisted,
    })
    expect(platform.enabled).toBe(true)
    expect(platform.source).toBe('allowlist')

    const studio = resolveFeatureForPublisher({
      featureKey: 'STUDIO',
      allowlistedKeys: allowlisted,
    })
    expect(studio.enabled).toBe(true)
    expect(studio.source).toBe('allowlist')

    const contentStudio = resolveFeatureForPublisher({
      featureKey: 'CONTENT_STUDIO',
      allowlistedKeys: allowlisted,
    })
    expect(contentStudio.enabled).toBe(true)
    expect(contentStudio.source).toBe('allowlist')

    const mediaUpload = resolveFeatureForPublisher({
      featureKey: 'MEDIA_UPLOAD',
      allowlistedKeys: allowlisted,
    })
    expect(mediaUpload.enabled).toBe(true)
    expect(mediaUpload.source).toBe('allowlist')

    const adServing = resolveFeatureForPublisher({
      featureKey: 'AD_SERVING',
      allowlistedKeys: allowlisted,
    })
    expect(adServing.enabled).toBe(true)
    expect(adServing.source).toBe('allowlist')
  })

  it('blocks VIDEO_PREROLL when not allowlisted', () => {
    const allowlisted = new Set([
      'PLATFORM',
      'STUDIO',
      'AD_INVENTORY',
      'SELF_MANAGED_ADS',
      'AD_SERVING',
    ])
    const preroll = resolveFeatureForPublisher({
      featureKey: 'VIDEO_PREROLL',
      allowlistedKeys: allowlisted,
    })
    expect(preroll.enabled).toBe(false)
    expect(preroll.source).toBe('off')
  })

  it('blocks ungranted real publisher completely', () => {
    const ungranted = new Set<string>()
    const studio = resolveFeatureForPublisher({
      featureKey: 'STUDIO',
      allowlistedKeys: ungranted,
    })
    expect(studio.enabled).toBe(false)

    const platform = resolveFeatureForPublisher({
      featureKey: 'PLATFORM',
      allowlistedKeys: ungranted,
    })
    expect(platform.enabled).toBe(false)
  })

  it('does not allowlist payment, marketplace, or consumer feed features', () => {
    expect(ALLOWLISTABLE_FEATURES.includes('SOCIAL_GRAPH' as any)).toBe(false)
    expect(ALLOWLISTABLE_FEATURES.includes('SMART_FEED' as any)).toBe(false)
    expect(ALLOWLISTABLE_FEATURES.includes('AD_MARKETPLACE' as any)).toBe(false)
    expect(ALLOWLISTABLE_FEATURES.includes('PAYMENT_INTENT' as any)).toBe(false)
  })
})

describe('Phase P12 — SEO & Public Visibility for Real Publisher', () => {
  const realPub: PublisherRecord = {
    id: 'pub_the_guardian',
    name: 'The Guardian World RSS',
    slug: 'the-guardian-world-rss',
    displayName: 'The Guardian',
    publisherType: 'NEWS_ORGANIZATION',
    status: 'UNCLAIMED',
    verificationStatus: 'UNCLAIMED',
    description: 'The Guardian international coverage',
    logoUrl: 'https://assets.guim.co.uk/images/guardian-logo-160.png',
    coverImageUrl: null,
    websiteUrl: 'https://www.theguardian.com',
    primaryDomain: 'theguardian.com',
    countryCode: 'GB',
    city: null,
    district: null,
    claimedAt: null,
    verifiedAt: null,
    createdAt: new Date('2026-08-27'),
    updatedAt: new Date('2026-08-27'),
  }

  it('serializes real publisher as publicly visible with no internal leak', () => {
    const serialized = serializePublicPublisher(realPub)
    expect(serialized.isPubliclyVisible).toBe(true)
    expect(serialized.publisherType).toBe('NEWS_ORGANIZATION')
    expect(serialized.slug).toBe('the-guardian-world-rss')
    expect(serialized.isVerified).toBe(false)
  })

  it('evaluates SEO as indexable for real publisher without noindex leakage', () => {
    const serialized = serializePublicPublisher(realPub)
    const seo = evaluatePublisherSeo(serialized, 50)
    expect(seo.indexable).toBe(true)
    expect(seo.noindexReason).toBe('none')
    expect(seo.follow).toBe(true)
  })

  it('keeps INTERNAL_TEST publisher non-indexable', () => {
    const internalTestPub: PublisherRecord = {
      ...realPub,
      id: 'pub_internal',
      publisherType: 'INTERNAL_TEST',
      slug: 'nahaber-test-yayincisi',
    }
    const serialized = serializePublicPublisher(internalTestPub)
    const seo = evaluatePublisherSeo(serialized, 10)
    expect(seo.indexable).toBe(false)
    expect(seo.noindexReason).toBe('internal_test_publisher')
  })
})

describe('Phase P12 — R2 Media Isolation', () => {
  it('scopes media storage keys strictly by publisher ID', () => {
    const guardianKey = buildPublisherAdMediaKey('pub_the_guardian', 'ad_123', 'banner.jpg')
    const testPubKey = buildPublisherAdMediaKey('pub_internal_test', 'ad_123', 'banner.jpg')
    expect(guardianKey).toBe('publishers/pub_the_guardian/ads/ad_123/banner.jpg')
    expect(testPubKey).toBe('publishers/pub_internal_test/ads/ad_123/banner.jpg')
    expect(guardianKey).not.toEqual(testPubKey)

    const contentKey = buildPublisherContentMediaKey('pub_the_guardian', 'content_456', 'hero.jpg')
    expect(contentKey).toBe('publishers/pub_the_guardian/content/content_456/hero.jpg')
  })
})
