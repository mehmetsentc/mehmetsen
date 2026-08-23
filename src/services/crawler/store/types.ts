import { randomUUID } from 'node:crypto'
import type {
  ArticleMediaRecord,
  ClusterMatchBand,
  ClusterMembershipRecord,
  ClusterScoreBreakdown,
  CrawlerEditorialAuditRecord,
  CrawlerEditorialStatus,
  CrawlerLogicalQueue,
  CrawlerMetricName,
  CrawlerQualityStatus,
  CrawlerSourceStatus,
  CrawlerUrlStatus,
  DiscoveredUrlRecord,
  NewsClusterRecord,
  NewsSourceRecord,
  RawArticleRecord,
} from '../types'

export function newCrawlerId(prefix = 'c'): string {
  return `${prefix}_${randomUUID()}`
}

export interface InsertSourceInput {
  name: string
  domain: string
  baseUrl: string
  countryCode: string
  countryName?: string | null
  region?: string | null
  city?: string | null
  district?: string | null
  language: string
  timezone?: string | null
  sourceType?: NewsSourceRecord['sourceType']
  status?: CrawlerSourceStatus
  priority?: number
  trustTier?: number
  discoveryMethod?: NewsSourceRecord['discoveryMethod']
  rssUrls?: string[]
  sitemapUrls?: string[]
  listingUrls?: string[]
  crawlIntervalSeconds?: number
  articleFetchMode?: NewsSourceRecord['articleFetchMode']
  requiresJavascript?: boolean
  robotsPolicy?: NewsSourceRecord['robotsPolicy']
  geographicScope?: NewsSourceRecord['geographicScope']
  sourceCategory?: NewsSourceRecord['sourceCategory']
  crawlPriority?: NewsSourceRecord['crawlPriority']
  qualityTier?: NewsSourceRecord['qualityTier']
  healthScore?: number
  freshnessHours?: number
  registryKey?: string | null
  /** Phase 4F.3.1 — required when creating as PAUSED for future auditability. */
  lastPauseReason?: string | null
}

export interface InsertClusterInput {
  representativeArticleId: string
  normalizedTopic: string
  countryCode: string | null
  city: string | null
  eventKey?: string | null
  canonicalTitle?: string | null
  language?: string | null
  region?: string | null
  district?: string | null
  categoryHint?: string | null
  signatureTokens?: string[]
}

export interface InsertDiscoveredUrlInput {
  sourceId: string
  url: string
  normalizedUrl: string
  urlHash: string
  publishedAtHint?: Date | null
  discoveryLane?: import('../types').DiscoveryLane
  discoveryLanes?: import('../types').DiscoveryLane[]
  titleHint?: string | null
  guid?: string | null
  discoveryPrimaryImageCandidate?: string | null
  rssDescription?: string | null
  feedMetadata?: Record<string, unknown> | null
}

export interface InsertRawArticleInput extends Omit<
  RawArticleRecord,
  | 'id'
  | 'clusterId'
  | 'aiEligibility'
  | 'aiSkipReason'
  | 'clusterStatus'
  | 'isExactDuplicate'
  | 'duplicateOfId'
  | 'qualityStatus'
  | 'boilerplateRatio'
  | 'linkDensity'
  | 'mediaStatus'
  | 'mediaExtractedAt'
  | 'primaryImageMethod'
  | 'imageCandidateCount'
  | 'imageRejectedCount'
  | 'editorialStatus'
  | 'editorialNewsId'
  | 'rejectionReason'
  | 'rejectionNote'
  | 'rejectedAt'
  | 'rejectedBy'
  | 'qualityGateReasons'
  | 'rssSnippetUsedAsBody'
  | 'clusterRole'
  | 'discoveryPrimaryImageCandidate'
  | 'primaryImageConfidence'
> {
  clusterId?: string | null
  aiEligibility?: RawArticleRecord['aiEligibility']
  aiSkipReason?: string | null
  clusterStatus?: RawArticleRecord['clusterStatus']
  isExactDuplicate?: boolean
  duplicateOfId?: string | null
  qualityStatus?: RawArticleRecord['qualityStatus']
  boilerplateRatio?: number | null
  linkDensity?: number | null
  mediaStatus?: RawArticleRecord['mediaStatus']
  mediaExtractedAt?: Date | null
  primaryImageMethod?: string | null
  imageCandidateCount?: number | null
  imageRejectedCount?: number | null
  editorialStatus?: CrawlerEditorialStatus
  editorialNewsId?: string | null
  rejectionReason?: RawArticleRecord['rejectionReason']
  rejectionNote?: string | null
  rejectedAt?: Date | null
  rejectedBy?: string | null
  qualityGateReasons?: string[] | null
  rssSnippetUsedAsBody?: boolean
  clusterRole?: RawArticleRecord['clusterRole']
  discoveryPrimaryImageCandidate?: string | null
  primaryImageConfidence?: number | null
}

export type RawArticleSort = 'newest' | 'oldest' | 'published'

export type RawArticleQueueTab = 'active' | 'published' | 'review' | 'rejected' | 'archived' | 'all'
export type RawArticleSortColumn =
  | 'fetchedAt'
  | 'publishedAt'
  | 'wordCount'
  | 'extractionConfidence'
  | 'source'
  | 'status'
  | 'editorial'
export type SortOrder = 'asc' | 'desc'

export interface RawArticleListQuery {
  page?: number
  pageSize?: number
  sort?: RawArticleSort
  sortBy?: RawArticleSortColumn | null
  order?: SortOrder | null
  queue?: RawArticleQueueTab | null
  sourceId?: string | null
  country?: string | null
  city?: string | null
  status?: string | null
  qualityStatus?: CrawlerQualityStatus | null
  dateFrom?: Date | null
  dateTo?: Date | null
  search?: string | null
  hasImage?: boolean | null
  editorialStatus?: CrawlerEditorialStatus | null
  view?: 'all' | 'bySource'
  /**
   * Phase 4E — default true on active Ham Haber queue.
   * Hide SUPPORTING/DUPLICATE/LOW_QUALITY cluster members so editors decide at EVENT level.
   * Evidence remains on Olay Detayı. Pass false / includeSupporting=1 to show all.
   */
  eventPrimaryOnly?: boolean | null
}

export interface RawArticleListRow extends RawArticleRecord {
  sourceName: string
}

export interface RawArticleSourceFacet {
  sourceId: string
  sourceName: string
  countryCode: string | null
  city: string | null
  articleCount: number
  latestFetchedAt: Date | null
  withImage: number
  duplicates: number
}

export interface RawArticleInboxSummary {
  total: number
  sourceCount: number
  lastHour: number
  withImage: number
  withoutImage: number
  duplicates: number
}

export interface RawArticleQueueCounts {
  active: number
  published: number
  review: number
  rejected: number
  archived: number
}

export interface RawArticleListResult {
  articles: RawArticleListRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  summary: RawArticleInboxSummary
  queueCounts?: RawArticleQueueCounts
  sources: RawArticleSourceFacet[]
  groups?: Array<RawArticleSourceFacet & { articles: RawArticleListRow[] }>
}

export interface CrawlerStore {
  listSources(): Promise<NewsSourceRecord[]>
  getSource(id: string): Promise<NewsSourceRecord | null>
  insertSource(input: InsertSourceInput): Promise<NewsSourceRecord>
  updateSource(
    id: string,
    patch: Partial<
      Pick<
        NewsSourceRecord,
        | 'status'
        | 'lastDiscoveryAt'
        | 'nextDiscoveryAt'
        | 'lastSuccessfulDiscoveryAt'
        | 'lastFeedEtag'
        | 'lastFeedModified'
        | 'consecutiveFailures'
        | 'averageResponseMs'
        | 'articlesDiscovered'
        | 'articlesFetched'
        | 'extractionSuccessRate'
        | 'geographicScope'
        | 'sourceCategory'
        | 'crawlPriority'
        | 'qualityTier'
        | 'healthScore'
        | 'freshnessHours'
        | 'lastPauseReason'
        | 'registryKey'
      >
    >
  ): Promise<void>
  listDueSources(now: Date, limit: number): Promise<NewsSourceRecord[]>
  countDueSources(now: Date): Promise<number>

  insertDiscoveredUrl(input: InsertDiscoveredUrlInput): Promise<'inserted' | 'duplicate'>
  getDiscoveredByHash(urlHash: string): Promise<DiscoveredUrlRecord | null>
  listPendingFetch(limit: number): Promise<DiscoveredUrlRecord[]>
  updateDiscoveredUrl(
    id: string,
    patch: Partial<
      Pick<
        DiscoveredUrlRecord,
        | 'status'
        | 'canonicalUrl'
        | 'fetchAttempts'
        | 'lastFetchAttempt'
        | 'failureReason'
        | 'etag'
        | 'lastModified'
        | 'logicalQueue'
        | 'discoveryLane'
        | 'discoveryLanes'
        | 'titleHint'
        | 'guid'
        | 'discoveryPrimaryImageCandidate'
        | 'rssDescription'
        | 'feedMetadata'
        | 'publishedAtHint'
      >
    >
  ): Promise<void>
  countByStatus(status: CrawlerUrlStatus): Promise<number>
  countQueue(queue: CrawlerLogicalQueue): Promise<number>

  insertRawArticle(input: InsertRawArticleInput): Promise<RawArticleRecord>
  getRawArticle(id: string): Promise<RawArticleRecord | null>
  listRecentArticles(limit?: number): Promise<RawArticleRecord[]>
  findRawByContentHash(hash: string): Promise<RawArticleRecord | null>
  findRawByTitleHash(hash: string): Promise<RawArticleRecord | null>
  findRawByCanonicalUrl(url: string): Promise<RawArticleRecord | null>
  recentRawForNearDup(sourceCountry: string | null, limit?: number): Promise<RawArticleRecord[]>
  recentClusters(countryCode: string | null, since: Date): Promise<
    Array<NewsClusterRecord & { representativeTitle?: string | null; representativeSimhash?: string | null }>
  >
  insertCluster(input: InsertClusterInput): Promise<NewsClusterRecord>
  updateCluster(id: string, patch: Partial<NewsClusterRecord>): Promise<void>
  getCluster(id: string): Promise<NewsClusterRecord | null>
  listClusters(opts?: {
    since?: Date
    countryCode?: string | null
    city?: string | null
    eligibility?: string | null
    editorialDecision?: string | null
    minSources?: number
    limit?: number
  }): Promise<NewsClusterRecord[]>
  listClustersMatching(query: import('../editorial/query').ClusterListQuery): Promise<NewsClusterRecord[]>
  listClustersPage(query: import('../editorial/query').ClusterListQuery): Promise<{
    clusters: NewsClusterRecord[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }>
  listClusterIdsMatching(
    query: import('../editorial/query').ClusterListQuery,
    cap: number
  ): Promise<{ ids: string[]; total: number }>
  countClusterFunnel(now?: Date): Promise<import('../editorial/controlPlane').ClusterFunnelCounts>
  countClusterTabs(
    query: import('../editorial/query').ClusterListQuery
  ): Promise<import('../editorial/controlPlane').ClusterTabCounts>
  countRawArticles(opts?: { excludeDeleted?: boolean }): Promise<number>
  listPendingClusterArticles(limit: number): Promise<RawArticleRecord[]>
  getMembershipByArticle(articleId: string): Promise<ClusterMembershipRecord | null>
  listMemberships(clusterId: string): Promise<ClusterMembershipRecord[]>
  insertMembership(input: {
    clusterId: string
    articleId: string
    sourceId: string
    similarityScore: number
    matchBand: ClusterMatchBand
    matchExplanation?: ClusterScoreBreakdown | null
    isCanonical?: boolean
    membershipRole?: import('../types').ClusterMembershipRole
    isIndependentSource?: boolean
  }): Promise<'inserted' | 'duplicate'>
  updateMembership(
    id: string,
    patch: Partial<Pick<ClusterMembershipRecord, 'isCanonical' | 'membershipRole' | 'isIndependentSource' | 'similarityScore'>>
  ): Promise<void>
  listFailedUrls(limit?: number): Promise<DiscoveredUrlRecord[]>
  touchCluster(id: string, representativeArticleId?: string): Promise<void>
  updateRawArticle(
    id: string,
    patch: Partial<
      Pick<
        RawArticleRecord,
        | 'clusterId'
        | 'aiEligibility'
        | 'aiSkipReason'
        | 'clusterStatus'
        | 'isExactDuplicate'
        | 'duplicateOfId'
        | 'qualityStatus'
        | 'mainImageUrl'
        | 'imageUrls'
        | 'mediaStatus'
        | 'mediaExtractedAt'
        | 'primaryImageMethod'
        | 'imageCandidateCount'
        | 'imageRejectedCount'
        | 'editorialStatus'
        | 'editorialNewsId'
        | 'rejectionReason'
        | 'rejectionNote'
        | 'rejectedAt'
        | 'rejectedBy'
        | 'qualityGateReasons'
        | 'rssSnippetUsedAsBody'
        | 'clusterRole'
        | 'discoveryPrimaryImageCandidate'
        | 'primaryImageConfidence'
        | 'articleBodyText'
        | 'articleBodyHtml'
        | 'wordCount'
        | 'charCount'
      >
    >
  ): Promise<void>
  listRawArticlesPage(query: RawArticleListQuery): Promise<RawArticleListResult>
  listRawArticleIds(query: RawArticleListQuery, cap: number): Promise<{ ids: string[]; total: number }>
  deleteRawArticle(id: string): Promise<void>
  insertEditorialAudit(row: CrawlerEditorialAuditRecord): Promise<void>
  listEditorialAudits(limit?: number): Promise<CrawlerEditorialAuditRecord[]>
  countEditorialStatuses(): Promise<Record<string, number>>
  countClusterEditorialDecisions(): Promise<Record<string, number>>
  clusterHasEligible(clusterId: string): Promise<boolean>
  hasAiCache(contentHash: string, promptVersion: string, model: string): Promise<boolean>

  incrementMetric(metric: CrawlerMetricName, amount?: number, now?: Date): Promise<void>
  getTodayMetrics(now?: Date): Promise<Record<string, number>>
  countActiveSources(): Promise<number>
  countFailedSources(): Promise<number>
  upsertArticleMedia(input: Omit<ArticleMediaRecord, 'id' | 'createdAt'> & { id?: string }): Promise<void>
  listArticleMedia(articleId: string): Promise<ArticleMediaRecord[]>
  listPendingMediaArticles(limit: number): Promise<RawArticleRecord[]>
  listRecentExtractedMediaArticles(limit: number): Promise<RawArticleRecord[]>
}
