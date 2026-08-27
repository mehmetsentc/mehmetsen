/** Advertiser marketplace — Phase P9 (discovery + booking request; no payment/serving). */

export type AdvertiserType = 'BUSINESS' | 'AGENCY' | 'BRAND' | 'INDIVIDUAL' | 'OTHER'
export type AdvertiserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type AdvertiserMemberRole = 'OWNER' | 'ADMIN' | 'CAMPAIGN_MANAGER' | 'ANALYST'
export type AdvertiserMemberStatus = 'ACTIVE' | 'INACTIVE'

export type CampaignObjective =
  | 'BRAND_AWARENESS'
  | 'TRAFFIC'
  | 'LOCAL_PROMOTION'
  | 'EVENT_PROMOTION'
  | 'OTHER'

export type CampaignStatus = 'DRAFT' | 'ACTIVE_REQUESTING' | 'PAUSED' | 'ARCHIVED'

export type BookingRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'OFFERED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PAID_PENDING_DELIVERY'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED'

export type CreativeType = 'IMAGE' | 'NATIVE_CARD' | 'SPONSORED_CARD'
export type CreativeStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
export type PlatformModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type CreativeReviewStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

export type AvailabilityResult = 'AVAILABLE' | 'CONFLICT' | 'NOT_SELLABLE'

export type MarketplaceAuditEventType =
  | 'ADVERTISER_CREATED'
  | 'CAMPAIGN_CREATED'
  | 'BOOKING_REQUEST_CREATED'
  | 'BOOKING_REQUEST_SUBMITTED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_OFFERED'
  | 'REQUEST_CANCELLED'
  | 'BOOKING_CREATED'
  | 'CREATIVE_CREATED'
  | 'CREATIVE_SUBMITTED'
  | 'CREATIVE_APPROVED'
  | 'CREATIVE_REJECTED'

export interface AdvertiserRecord {
  id: string
  name: string
  slug: string
  advertiserType: AdvertiserType
  status: AdvertiserStatus
  websiteUrl: string | null
  city: string | null
  country: string | null
  logoUrl: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface AdvertiserMemberRecord {
  id: string
  advertiserId: string
  userId: string
  role: AdvertiserMemberRole
  status: AdvertiserMemberStatus
  createdAt: Date
  updatedAt: Date
}

export interface AdvertiserCampaignRecord {
  id: string
  advertiserId: string
  name: string
  objective: CampaignObjective
  status: CampaignStatus
  startAt: Date | null
  endAt: Date | null
  budgetMinor: number | null
  currency: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface AdvertiserCreativeRecord {
  id: string
  advertiserId: string
  campaignId: string | null
  name: string
  creativeType: CreativeType
  headline: string | null
  body: string | null
  mediaUrl: string | null
  destinationUrl: string | null
  status: CreativeStatus
  platformModerationStatus: PlatformModerationStatus
  version: number
  createdBy: string
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AdBookingRequestRecord {
  id: string
  advertiserId: string
  campaignId: string
  publisherId: string
  inventoryId: string
  creativeId: string | null
  status: BookingRequestStatus
  requestedStartAt: Date
  requestedEndAt: Date
  requestedImpressions: number | null
  priceSnapshotMinor: number | null
  pricingModelSnapshot: string
  durationSnapshot: number | null
  impressionSnapshot: number | null
  currency: string
  message: string | null
  publisherOfferMinor: number | null
  publisherNote: string | null
  creativeReviewStatus: CreativeReviewStatus | null
  expiresAt: Date | null
  createdBy: string
  publisherReviewedBy: string | null
  publisherReviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface AdBookingRecord {
  id: string
  bookingRequestId: string
  advertiserId: string
  campaignId: string
  publisherId: string
  inventoryId: string
  creativeId: string | null
  creativeSnapshot: Record<string, unknown> | null
  status: BookingStatus
  startAt: Date
  endAt: Date
  impressionLimit: number | null
  priceMinor: number | null
  currency: string
  pricingModelSnapshot: string
  grossAmountMinor: number | null
  platformCommissionRateBps: number | null
  platformCommissionMinor: number | null
  publisherGrossMinor: number | null
  publisherNetMinor: number | null
  taxPlaceholderMinor: number | null
  invoiceStatus: string | null
  taxProfileId: string | null
  commercialSnapshotAt: Date | null
  commercialFrozen: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MarketplaceInventoryCard {
  inventoryId: string
  name: string
  description: string | null
  inventoryType: string
  placementScope: string
  format: string
  pricingModel: string
  priceMinor: number | null
  currency: string
  periodDays: number | null
  impressionCap: number | null
  saleStatus: string
  previewNote: string | null
  publisher: {
    id: string
    slug: string
    name: string
    displayName: string
    logoUrl: string | null
    city: string | null
    district: string | null
    description: string | null
    verificationStatus: string
  }
}

export interface MarketplaceBrowseFilters {
  city?: string
  district?: string
  publisherId?: string
  inventoryType?: string
  placementScope?: string
  format?: string
  pricingModel?: string
  priceMinMinor?: number
  priceMaxMinor?: number
  q?: string
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'newest'
  preferredCity?: string
  cursor?: string
  limit?: number
}

export interface CreateAdvertiserInput {
  name: string
  websiteUrl?: string | null
  city?: string | null
  advertiserType: AdvertiserType
  country?: string | null
}

export interface CreateCampaignInput {
  name: string
  objective: CampaignObjective
  startAt?: string | null
  endAt?: string | null
  budgetMinor?: number | null
  currency?: string
}

export interface CreateBookingRequestInput {
  campaignId: string
  inventoryId: string
  requestedStartAt: string
  requestedEndAt: string
  requestedImpressions?: number | null
  message?: string | null
  creativeId?: string | null
}

export interface CreateCreativeInput {
  name: string
  creativeType: CreativeType
  headline?: string | null
  body?: string | null
  mediaUrl?: string | null
  destinationUrl?: string | null
  campaignId?: string | null
}

export const ADVERTISER_TYPES: AdvertiserType[] = [
  'BUSINESS',
  'AGENCY',
  'BRAND',
  'INDIVIDUAL',
  'OTHER',
]

export const CAMPAIGN_OBJECTIVES: CampaignObjective[] = [
  'BRAND_AWARENESS',
  'TRAFFIC',
  'LOCAL_PROMOTION',
  'EVENT_PROMOTION',
  'OTHER',
]

export const CREATIVE_TYPES: CreativeType[] = ['IMAGE', 'NATIVE_CARD', 'SPONSORED_CARD']

export const BOOKING_REQUEST_STATUSES: BookingRequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'OFFERED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]

export const ADVERTISER_TYPE_LABELS: Record<AdvertiserType, string> = {
  BUSINESS: 'İşletme',
  AGENCY: 'Ajans',
  BRAND: 'Marka',
  INDIVIDUAL: 'Bireysel',
  OTHER: 'Diğer',
}

export const CAMPAIGN_OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  BRAND_AWARENESS: 'Marka bilinirliği',
  TRAFFIC: 'Trafik',
  LOCAL_PROMOTION: 'Yerel tanıtım',
  EVENT_PROMOTION: 'Etkinlik tanıtımı',
  OTHER: 'Diğer',
}

export const BOOKING_REQUEST_STATUS_LABELS: Record<BookingRequestStatus, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Gönderildi',
  UNDER_REVIEW: 'İnceleniyor',
  OFFERED: 'Teklif var',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  CANCELLED: 'İptal',
  EXPIRED: 'Süresi doldu',
}
