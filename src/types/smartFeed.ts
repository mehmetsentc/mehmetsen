export type FeedMode = 'personal' | 'following' | 'breaking' | 'local'

export type FeedCandidateSource =
  | 'FOLLOWING'
  | 'BREAKING'
  | 'LOCAL'
  | 'RECENT'
  | 'POPULAR'
  | 'DISCOVERY'

export interface FeedPublisherDto {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

export interface FeedSocialState {
  liked: boolean
  saved: boolean
}

export interface FeedSocialCounts {
  likes: number
  comments: number
  saves: number
  shares: number
}

export interface FeedItemDto {
  id: string
  type: 'article'
  articleId: string
  clusterId: string | null
  publisher: FeedPublisherDto | null
  headline: string
  summary: string | null
  category: string | null
  image: string | null
  video: string | null
  publishedAt: string
  updatedAt: string
  breaking: boolean
  materialUpdate: boolean
  clusterSourceCount: number
  socialState: FeedSocialState | null
  socialCounts: FeedSocialCounts
  reason: FeedCandidateSource
  slug: string
}

export interface FeedPageDto {
  items: FeedItemDto[]
  nextCursor: string | null
  hasMore: boolean
  mode: FeedMode
  emptyReason?: string
}

export type FeedTelemetryEventType =
  | 'feed_request'
  | 'feed_impression'
  | 'feed_empty'
  | 'feed_error'
  | 'article_dwell'
  | 'quick_skip'
  | 'article_opened'

export interface FeedTelemetryBatchItem {
  eventType: FeedTelemetryEventType
  articleId?: string
  clusterId?: string | null
  feedType?: FeedMode | string
  dwellMs?: number
  metadata?: Record<string, unknown>
}

export interface FeedCursorPayload {
  publishedAt: string
  id: string
}

export interface FeedCandidateRow {
  articleId: string
  clusterId: string | null
  publisherId: string | null
  publisherSlug: string | null
  publisherName: string | null
  publisherLogoUrl: string | null
  headline: string
  summary: string | null
  category: string | null
  image: string | null
  video: string | null
  publishedAt: Date
  updatedAt: Date
  breaking: boolean
  materialUpdate: boolean
  clusterSourceCount: number
  likesCount: number
  commentsCount: number
  savesCount: number
  sharesCount: number
  slug: string
  source: FeedCandidateSource
  sortScore: number
}
