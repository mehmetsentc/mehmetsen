/** Publisher self-managed ads — Phase P10 (no payment / marketplace booking). */

export type PublisherManagedAdStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED'
  | 'ARCHIVED'

export type PublisherAdCreativeType =
  | 'IMAGE_BANNER'
  | 'NATIVE_CARD'
  | 'VIDEO'
  | 'SPONSORED_CARD'

export type PublisherAdSourceType = 'SELF_MANAGED' | 'MARKETPLACE'

export const MANAGED_AD_STATUSES: PublisherManagedAdStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'ARCHIVED',
]

export const AD_CREATIVE_TYPES: PublisherAdCreativeType[] = [
  'IMAGE_BANNER',
  'NATIVE_CARD',
  'VIDEO',
  'SPONSORED_CARD',
]

export const MANAGED_AD_STATUS_LABELS: Record<PublisherManagedAdStatus, string> = {
  DRAFT: 'Taslak',
  SCHEDULED: 'Planlanan',
  ACTIVE: 'Aktif',
  PAUSED: 'Duraklatıldı',
  ENDED: 'Bitti',
  ARCHIVED: 'Arşiv',
}

export const AD_CREATIVE_TYPE_LABELS: Record<PublisherAdCreativeType, string> = {
  IMAGE_BANNER: 'Görsel banner',
  NATIVE_CARD: 'Native kart',
  VIDEO: 'Video',
  SPONSORED_CARD: 'Sponsorlu kart',
}

export interface PublisherManagedAdRecord {
  id: string
  publisherId: string
  inventoryId: string
  name: string
  advertiserName: string
  advertiserId: string | null
  status: PublisherManagedAdStatus
  startAt: Date
  endAt: Date
  destinationUrl: string | null
  internalNote: string | null
  sourceType: PublisherAdSourceType
  createdBy: string
  updatedBy: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PublisherAdCreativeRecord {
  id: string
  publisherId: string
  adId: string
  creativeType: PublisherAdCreativeType
  mediaUrl: string
  thumbnailUrl: string | null
  headline: string | null
  body: string | null
  altText: string | null
  durationSeconds: number | null
  version: number
  isCurrent: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PublisherManagedAdCreateInput {
  inventoryId: string
  name: string
  advertiserName: string
  startAt: string | Date
  endAt: string | Date
  destinationUrl?: string | null
  internalNote?: string | null
  status?: Extract<PublisherManagedAdStatus, 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED'>
  advertiserId?: string | null
}

export interface PublisherManagedAdUpdateInput {
  name?: string
  advertiserName?: string
  inventoryId?: string
  startAt?: string | Date
  endAt?: string | Date
  destinationUrl?: string | null
  internalNote?: string | null
  status?: Exclude<PublisherManagedAdStatus, 'ARCHIVED'>
}

export interface PublisherAdCreativeCreateInput {
  creativeType: PublisherAdCreativeType
  mediaUrl: string
  thumbnailUrl?: string | null
  headline?: string | null
  body?: string | null
  altText?: string | null
  durationSeconds?: number | null
}

export interface ResolvedPublisherAd {
  ad: PublisherManagedAdRecord
  creative: PublisherAdCreativeRecord
  clickHref: string
}

export interface PublisherAdAnalyticsRow {
  adId: string
  impressions: number
  clicks: number
  ctr: number
}

export interface PublisherAdAnalyticsSummary {
  impressions: number
  clicks: number
  ctr: number
  byAd: PublisherAdAnalyticsRow[]
}
