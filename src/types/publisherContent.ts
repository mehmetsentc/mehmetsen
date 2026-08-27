import type { ArticleBlock } from '@/lib/articleBlocks'

export type PublisherContentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED'

export type PublisherContentSourceMode = 'MANUAL' | 'CRAWLER_SOURCE' | 'IMPORT'

export type PublisherContentRightsBasis =
  | 'PUBLISHER_ORIGINAL'
  | 'SOURCE_ASSOCIATED'
  | 'UNKNOWN'

export type PublisherContentRightsStatus = 'CLEARED' | 'PENDING' | 'UNKNOWN' | 'RESTRICTED'

export type PublisherContentAuditEvent =
  | 'CONTENT_CREATED'
  | 'CONTENT_SAVED'
  | 'CONTENT_SUBMITTED'
  | 'CONTENT_CHANGES_REQUESTED'
  | 'CONTENT_APPROVED'
  | 'CONTENT_SCHEDULED'
  | 'CONTENT_PUBLISHED'
  | 'CONTENT_FAST_PUBLISHED'
  | 'CONTENT_ARCHIVED'
  | 'CONTENT_BREAKING_SET'
  | 'CONTENT_BREAKING_CLEARED'
  | 'CONTENT_SOURCE_IMPORTED'
  | 'CONTENT_PREVIEWED'
  | 'SCHEDULE_CLAIMED'
  | 'SCHEDULE_PUBLISHED'
  | 'SCHEDULE_CLAIM_STALE_RECOVERED'

export interface PublisherContentItem {
  id: string
  publisherId: string
  status: PublisherContentStatus
  sourceMode: PublisherContentSourceMode
  title: string
  spot: string | null
  summary: string | null
  bodyBlocks: ArticleBlock[]
  bodyHtml: string | null
  categoryId: string | null
  citySlug: string | null
  districtSlug: string | null
  cityName: string | null
  districtName: string | null
  heroImageUrl: string | null
  videoUrl: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  seoSlug: string | null
  isBreaking: boolean
  rightsStatus: PublisherContentRightsStatus
  rightsBasis: PublisherContentRightsBasis
  sourceUrl: string | null
  originalSourceId: string | null
  crawlerRawArticleId: string | null
  crawlerClusterId: string | null
  publishedNewsId: string | null
  publishedAt: Date | null
  scheduledAt: Date | null
  scheduleTimezone: string | null
  scheduleClaimedAt: Date | null
  scheduleClaimedBy: string | null
  scheduleClaimExpiresAt: Date | null
  reviewNote: string | null
  createdBy: string
  updatedBy: string | null
  approvedBy: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface PublisherContentRevision {
  id: string
  contentId: string
  revisionNumber: number
  status: PublisherContentStatus
  snapshot: Record<string, unknown>
  changeKind: string
  note: string | null
  createdBy: string | null
  createdAt: Date
}

export interface PublisherContentAuditRow {
  id: string
  contentId: string
  publisherId: string
  eventType: PublisherContentAuditEvent | string
  actorUserId: string | null
  payload: Record<string, unknown> | null
  createdAt: Date
}

export interface PublisherContentDraftInput {
  title?: string
  spot?: string | null
  summary?: string | null
  bodyBlocks?: ArticleBlock[]
  bodyHtml?: string | null
  categoryId?: string | null
  citySlug?: string | null
  districtSlug?: string | null
  cityName?: string | null
  districtName?: string | null
  heroImageUrl?: string | null
  videoUrl?: string | null
  tags?: string[]
  seoTitle?: string | null
  seoDescription?: string | null
  seoSlug?: string | null
  isBreaking?: boolean
  rightsStatus?: PublisherContentRightsStatus
  rightsBasis?: PublisherContentRightsBasis
  sourceUrl?: string | null
  /** Optimistic concurrency — reject if mismatch. */
  expectedUpdatedAt?: string | null
  expectedVersion?: number | null
}

export interface PublisherSourceArticleItem {
  rawArticleId: string
  sourceId: string
  title: string
  url: string | null
  summary: string | null
  publishedAt: Date | null
  clusterId: string | null
  clusterSlug: string | null
  relationshipType: string
}

export const EDITABLE_CONTENT_STATUSES: PublisherContentStatus[] = [
  'DRAFT',
  'CHANGES_REQUESTED',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
]

export const CONTENT_STATUS_LABELS: Record<PublisherContentStatus, string> = {
  DRAFT: 'Taslak',
  IN_REVIEW: 'İncelemede',
  CHANGES_REQUESTED: 'Düzeltme İstendi',
  APPROVED: 'Onaylı',
  SCHEDULED: 'Planlanan',
  PUBLISHED: 'Yayınlanan',
  ARCHIVED: 'Arşiv',
}
