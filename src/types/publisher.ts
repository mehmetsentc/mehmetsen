/** NaHaber Publisher Platform — Phase P1/P1.1 types (varchar enums in DB). */

export type PublisherType =
  | 'NEWS_ORGANIZATION'
  | 'LOCAL_MEDIA'
  | 'AGENCY'
  | 'MAGAZINE'
  | 'BLOG'
  | 'OTHER'
  /** Controlled pilot / QA only — never public discovery, sitemap, or Smart Feed. */
  | 'INTERNAL_TEST'

/** Operational profile visibility (not claim/verification workflow). */
export type PublisherStatus = 'UNCLAIMED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

/** Claim / ownership verification workflow. */
export type PublisherVerificationStatus =
  | 'UNCLAIMED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVOKED'

export type PublisherSourceRelationship = 'PRIMARY' | 'SYNDICATED' | 'MIRROR' | 'OTHER'

export type PublisherMemberRole =
  | 'OWNER'
  | 'ADMIN'
  | 'EDITOR'
  | 'AUTHOR'
  | 'AD_MANAGER'
  | 'ANALYST'
  | 'VIEWER'

export type PublisherMemberStatus = 'ACTIVE' | 'INVITED' | 'REMOVED'

export type PublisherClaimType = 'OWNERSHIP' | 'REPRESENTATIVE'

export type PublisherClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REVOKED'

export type PublisherClaimVerificationMethod = 'DOMAIN_EMAIL' | 'MANUAL' | 'DOCUMENT'

export interface PublisherRecord {
  id: string
  name: string
  slug: string
  displayName: string
  publisherType: PublisherType
  status: PublisherStatus
  description: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  websiteUrl: string | null
  primaryDomain: string | null
  countryCode: string | null
  city: string | null
  district: string | null
  verificationStatus: PublisherVerificationStatus
  claimedAt: Date | null
  verifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Safe public projection — no firebase_uid, business_email, verification_payload, review fields. */
export interface PublicPublisherRecord {
  id: string
  slug: string
  displayName: string
  publisherType: PublisherType
  status: PublisherStatus
  description: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  websiteUrl: string | null
  countryCode: string | null
  city: string | null
  district: string | null
  verificationStatus: PublisherVerificationStatus
  isVerified: boolean
  isPubliclyVisible: boolean
}

export interface PublisherSourceRecord {
  id: string
  publisherId: string
  sourceId: string
  relationshipType: PublisherSourceRelationship
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PublisherMemberRecord {
  id: string
  publisherId: string
  userId: string
  role: PublisherMemberRole
  status: PublisherMemberStatus
  invitedAt: Date | null
  acceptedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PublisherClaimRequestRecord {
  id: string
  publisherId: string
  userId: string
  claimType: PublisherClaimType
  status: PublisherClaimStatus
  requestedDomain: string | null
  businessEmail: string | null
  verificationMethod: PublisherClaimVerificationMethod | null
  verificationPayload: Record<string, unknown> | null
  reviewedBy: string | null
  reviewedAt: Date | null
  rejectionReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PublisherArticleItem {
  id: string
  slug: string
  title: string
  summary: string | null
  thumbnailUrl: string | null
  publishedAt: Date | null
  sourceId: string
  categoryId?: string | null
}

export interface PublisherArticlePage {
  items: PublisherArticleItem[]
  nextCursor: string | null
}

export type PublisherAdminFilter = 'all' | 'unclaimed' | 'pending' | 'verified' | 'rejected'

export type BootstrapPublisherAction =
  | 'CREATE_PUBLISHER'
  | 'LINK_EXISTING'
  | 'SKIP_ALREADY_LINKED'
  | 'DOMAIN_AMBIGUOUS'
  | 'SLUG_COLLISION'
  | 'ERROR'

export interface BootstrapPublisherResult {
  dryRun: boolean
  processed: number
  created: number
  matched: number
  collisions: number
  skipped: number
  ambiguous: number
  errors: number
  details: Array<{
    sourceId: string
    sourceName: string
    normalizedDomain: string
    action: BootstrapPublisherAction
    publisherId?: string
    slug?: string
    message?: string
  }>
}

export interface ApproveClaimResult {
  publisher: PublisherRecord
  claim: PublisherClaimRequestRecord
  alreadyApproved: boolean
}

export interface RejectClaimResult {
  claim: PublisherClaimRequestRecord
  alreadyRejected: boolean
}

export interface RevokeClaimResult {
  publisher: PublisherRecord
  claim: PublisherClaimRequestRecord
  alreadyRevoked: boolean
}

