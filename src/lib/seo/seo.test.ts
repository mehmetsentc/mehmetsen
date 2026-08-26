/**
 * Phase P6 SEO eligibility + structured data tests.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  evaluateArticleSeo,
  evaluatePublisherSeo,
  evaluateTopicSeo,
  evaluateEventSeo,
  evaluateUserProfileSeo,
} from '@/lib/seo/seoEligibility'
import { articleCanonicalUrl } from '@/lib/seo/canonical'
import { buildPublisherOrganizationJsonLd } from '@/lib/seo/structuredData'
import { isSeoDistributionV1Enabled, isEventPagesEnabled, isSyntheticSimulatorEnabled } from '@/lib/seo/featureFlag'

describe('P6 SEO flags prod default false', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'production' }
    delete process.env.SEO_DISTRIBUTION_V1_ENABLED
    delete process.env.EVENT_PAGES_ENABLED
    delete process.env.SYNTHETIC_SIMULATOR_ENABLED
  })
  afterEach(() => {
    process.env = env
  })

  it('SEO distribution off in prod', () => {
    expect(isSeoDistributionV1Enabled()).toBe(false)
  })
  it('event pages off in prod', () => {
    expect(isEventPagesEnabled()).toBe(false)
  })
  it('synthetic hard disabled in prod', () => {
    process.env.SYNTHETIC_SIMULATOR_ENABLED = 'true'
    expect(isSyntheticSimulatorEnabled()).toBe(false)
  })
})

describe('P6 article SEO', () => {
  it('published article is indexable', () => {
    const r = evaluateArticleSeo({ status: 'published', title: 'Test haber' })
    expect(r.indexable).toBe(true)
  })

  it('canonical uses haber slug path', () => {
    const url = articleCanonicalUrl({ id: 'id1', slug: 'test-haber' })
    expect(url).toContain('/haber/test-haber')
  })
})

describe('P6 publisher schema', () => {
  it('unclaimed publisher has no false verified claims', () => {
    const json = buildPublisherOrganizationJsonLd({
      displayName: 'Test Gazete',
      slug: 'test-gazete',
      description: null,
      logoUrl: null,
      websiteUrl: null,
      verificationStatus: 'UNCLAIMED',
      isVerified: false,
    })
    expect(json['@type']).toBe('NewsMediaOrganization')
    expect(json.disambiguatingDescription).toContain('doğrulanmamış')
    expect(json.publishingPrinciples).toBeUndefined()
  })

  it('suspended publisher noindex', () => {
    const r = evaluatePublisherSeo({
      displayName: 'X',
      status: 'SUSPENDED',
      isPubliclyVisible: false,
    })
    expect(r.indexable).toBe(false)
    expect(r.noindexReason).toBe('suspended_publisher')
  })
})

describe('P6 topic thin content', () => {
  it('thin topic noindex', () => {
    expect(evaluateTopicSeo('test', 1).indexable).toBe(false)
    expect(evaluateTopicSeo('test', 5).indexable).toBe(true)
  })
})

describe('P6 event eligibility', () => {
  it('low confidence event noindex', () => {
    const r = evaluateEventSeo({
      canonicalTitle: 'Deprem',
      sourceCount: 1,
      clusterConfidence: 0.3,
    })
    expect(r.indexable).toBe(false)
    expect(r.noindexReason).toBe('low_confidence_event')
  })

  it('eligible event indexable', () => {
    const r = evaluateEventSeo({
      canonicalTitle: 'Seçim sonuçları',
      sourceCount: 5,
      clusterConfidence: 0.8,
      eventStatus: 'OPEN',
      aiEligibility: 'WATCHING',
    })
    expect(r.indexable).toBe(true)
  })
})

describe('P6 user profile noindex', () => {
  it('user profiles never indexed', () => {
    expect(evaluateUserProfileSeo().indexable).toBe(false)
  })
})
