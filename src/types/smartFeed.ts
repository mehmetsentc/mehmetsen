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

export type FeedRankReason =
  | 'FOLLOWING_FRESH'
  | 'LOCAL_RELEVANT'
  | 'INTEREST_MATCH'
  | 'BREAKING_URGENT'
  | 'EDITORIAL_PRIORITY'
  | 'MATERIAL_UPDATE'
  | 'DISCOVERY'
  | 'POPULAR'
  | 'RECENT'
  | FeedCandidateSource

export interface FeedScoreBreakdown {
  following: number
  freshness: number
  interest: number
  local: number
  editorial: number
  quality: number
  engagement: number
  discovery: number
  materialUpdate: number
  penalties: number
  total: number
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
  reason: FeedRankReason
  scoreBreakdown?: FeedScoreBreakdown
  slug: string
}

export interface FeedPageDto {
  items: FeedItemDto[]
  nextCursor: string | null
  hasMore: boolean
  mode: FeedMode
  emptyReason?: string
  rankingVersion?: string
  feedSessionId?: string | null
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
  offset?: number
  session?: string
}

export interface FeedCandidateRow {
  articleId: string
  clusterId: string | null
  publisherId: string | null
  publisherSlug: string | null
  publisherName: string | null
  publisherLogoUrl: string | null
  publisherVerified?: boolean
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
  clusterImportance?: number
  sourceQualityTier?: string | null
  sourceHealthScore?: number
  citySlug?: string | null
  districtSlug?: string | null
  likesCount: number
  commentsCount: number
  savesCount: number
  sharesCount: number
  viewsCount?: number
  slug: string
  source: FeedCandidateSource
  sortScore: number
}

export interface FeedUserContext {
  userId: string | null
  isSynthetic: boolean
  explicitInterests: string[]
  behavioralInterests: Map<string, number>
  publisherAffinities: Map<string, number>
  followedPublisherIds: Set<string>
  negativePreferences: Array<{
    preferenceType: string
    targetType: string
    targetId: string
    modifier: number
  }>
  city: string | null
  districtSlug: string | null
}

export interface ScoredFeedCandidate extends FeedCandidateRow {
  score: number
  reason: FeedRankReason
  breakdown: FeedScoreBreakdown
}
