import type { PublisherType, PublisherVerificationStatus } from '@/types/publisher'

/** Public classification from the publisher type enum. Not a verification claim. */
export function publisherTypeLabel(type: PublisherType): string {
  switch (type) {
    case 'NEWS_ORGANIZATION':
      return 'Haber kuruluşu'
    case 'LOCAL_MEDIA':
      return 'Yerel kaynak'
    case 'AGENCY':
      return 'Haber ajansı'
    case 'MAGAZINE':
      return 'Dergi'
    case 'BLOG':
      return 'Blog'
    case 'OTHER':
    case 'INTERNAL_TEST':
      return 'Kaynak'
  }
}

/**
 * Trust copy only when verificationStatus is VERIFIED.
 * UNCLAIMED / PENDING / REJECTED / REVOKED never render as verified.
 */
export function publisherTrustLabel(status: PublisherVerificationStatus): string | null {
  if (status === 'VERIFIED') return 'Doğrulanmış kaynak'
  return null
}

/** Non-trust status line. Pending/unclaimed are facts, not badges of authority. */
export function publisherStatusLabel(status: PublisherVerificationStatus): string | null {
  if (status === 'UNCLAIMED') return 'Sahiplenilmemiş'
  if (status === 'PENDING') return 'Doğrulama bekliyor'
  return null
}

/** Editorial kicker from stored author fields. isVerified is the Firestore flag, not a UI guess. */
export function editorIdentityLabel(author: { isAI?: boolean; isVerified: boolean }): string {
  if (author.isVerified) return 'Doğrulanmış editör'
  return 'Yazar'
}
