import { describe, expect, it } from 'vitest'
import {
  isInternalTestPublisher,
  isPublisherPubliclyVisible,
  serializePublicPublisher,
} from '@/lib/publisher/public'
import type { PublisherRecord } from '@/types/publisher'

const basePublisher: PublisherRecord = {
  id: 'pub_test',
  name: 'Test',
  slug: 'test',
  displayName: 'Test Publisher',
  publisherType: 'NEWS_ORGANIZATION',
  status: 'ACTIVE',
  description: 'Public bio',
  logoUrl: 'https://cdn.example/logo.png',
  coverImageUrl: null,
  websiteUrl: 'https://example.com',
  primaryDomain: 'example.com',
  countryCode: 'TR',
  city: 'İstanbul',
  district: null,
  verificationStatus: 'VERIFIED',
  claimedAt: new Date(),
  verifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('serializePublicPublisher', () => {
  it('omits internal-only fields', () => {
    const pub = serializePublicPublisher(basePublisher)
    expect(pub).toMatchObject({
      slug: 'test',
      displayName: 'Test Publisher',
      isVerified: true,
      isPubliclyVisible: true,
    })
    expect(pub).not.toHaveProperty('name')
    expect(pub).not.toHaveProperty('primaryDomain')
    expect(pub).not.toHaveProperty('claimedAt')
    expect(pub).not.toHaveProperty('verifiedAt')
    expect(pub).not.toHaveProperty('firebaseUid')
    expect(pub).not.toHaveProperty('businessEmail')
    expect(pub).not.toHaveProperty('verificationPayload')
  })

  it('marks suspended publishers as not publicly visible', () => {
    const pub = serializePublicPublisher({ ...basePublisher, status: 'SUSPENDED' })
    expect(pub.isPubliclyVisible).toBe(false)
  })

  it('excludes INTERNAL_TEST from public discovery', () => {
    const internal = { ...basePublisher, publisherType: 'INTERNAL_TEST' as const }
    expect(isInternalTestPublisher(internal)).toBe(true)
    expect(isPublisherPubliclyVisible(internal)).toBe(false)
    expect(serializePublicPublisher(internal).isPubliclyVisible).toBe(false)
  })
})
