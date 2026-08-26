import type { PublicPublisherRecord, PublisherRecord } from '@/types/publisher'

export function isPublisherVerified(publisher: Pick<PublisherRecord, 'status' | 'verificationStatus'>): boolean {
  return publisher.verificationStatus === 'VERIFIED'
}

export function isPublisherPubliclyVisible(
  publisher: Pick<PublisherRecord, 'status' | 'verificationStatus'>
): boolean {
  if (publisher.status === 'SUSPENDED' || publisher.status === 'INACTIVE') return false
  return true
}

/** Strip internal/sensitive fields before public profile or API response. */
export function serializePublicPublisher(publisher: PublisherRecord): PublicPublisherRecord {
  return {
    id: publisher.id,
    slug: publisher.slug,
    displayName: publisher.displayName,
    publisherType: publisher.publisherType,
    status: publisher.status,
    description: publisher.description,
    logoUrl: publisher.logoUrl,
    coverImageUrl: publisher.coverImageUrl,
    websiteUrl: publisher.websiteUrl,
    countryCode: publisher.countryCode,
    city: publisher.city,
    district: publisher.district,
    verificationStatus: publisher.verificationStatus,
    isVerified: isPublisherVerified(publisher),
    isPubliclyVisible: isPublisherPubliclyVisible(publisher),
  }
}
