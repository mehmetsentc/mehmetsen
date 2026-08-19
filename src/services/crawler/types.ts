export type GeographicScope = 'GLOBAL' | 'NATIONAL' | 'REGIONAL' | 'CITY' | 'DISTRICT'

export type CrawlerSourceCategory =
  | 'GENERAL'
  | 'LOCAL'
  | 'ECONOMY'
  | 'SPORTS'
  | 'TECHNOLOGY'
  | 'MAGAZINE'
  | 'POLITICS'
  | 'PUBLIC'
  | 'AGENCY'

export type CrawlPriorityBand = 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'

export type CrawlerQualityTier = 'TIER_A' | 'TIER_B' | 'TIER_C' | 'BLOCKED' | 'UNTESTED'

export type CrawlerQualityStatus = 'EXTRACTED' | 'LOW_CONFIDENCE' | 'FAILED'

export type CrawlerMediaStatus = 'PENDING' | 'EXTRACTED' | 'NONE' | 'FAILED'

export type CrawlerEditorialStatus = 'NEW' | 'DRAFT' | 'EDITING' | 'PUBLISHED' | 'SKIPPED'

export interface ArticleMediaRecord {
  id: string
  articleId: string
  mediaType: string
  sourceUrl: string
  normalizedUrl: string
  width: number | null
  height: number | null
  altText: string | null
  caption: string | null
  credit: string | null
  mimeType: string | null
  discoveryMethod: string
  score: number
  isPrimary: boolean
  status: 'ACCEPTED' | 'REJECTED'
  rejectionReason: string | null
  qualityScore: number | null
  contentHash: string | null
  perceptualHash: string | null
  createdAt: Date
}

export type CrawlerSourceType =
  | 'NATIONAL'
  | 'LOCAL'
  | 'INTERNATIONAL'
  | 'AGENCY'
  | 'MAGAZINE'
  | 'SPORT'
  | 'FINANCE'
  | 'TECHNOLOGY'
  | 'OTHER'

export type CrawlerSourceStatus = 'ACTIVE' | 'PAUSED' | 'DEGRADED' | 'DISABLED'

export type CrawlerDiscoveryMethod =
  | 'RSS'
  | 'ATOM'
  | 'NEWS_SITEMAP'
  | 'SITEMAP'
  | 'LISTING'
  | 'HYBRID'

export type CrawlerArticleFetchMode = 'HTTP' | 'BROWSER' | 'AUTO'

export type CrawlerRobotsPolicy = 'FOLLOW' | 'STRICT' | 'IGNORE'

export type CrawlerUrlStatus =
  | 'PENDING_FETCH'
  | 'FETCHING'
  | 'FETCHED'
  | 'EXTRACTED'
  | 'DUPLICATE'
  | 'CLUSTER_PENDING'
  | 'AI_ELIGIBLE'
  | 'AI_SKIPPED'
  | 'FAILED'
  | 'FAILED_404'
  | 'FAILED_SSRF'
  | 'LOW_CONFIDENCE'

export type CrawlerLogicalQueue =
  | 'DISCOVERY_QUEUE'
  | 'ARTICLE_FETCH_QUEUE'
  | 'EXTRACTION_QUEUE'
  | 'CLUSTER_QUEUE'
  | 'AI_CANDIDATE_QUEUE'
  | 'FAILED_QUEUE'

export type CrawlerAiEligibility = 'PENDING' | 'ELIGIBLE' | 'SKIPPED'

export type CrawlerClusterStatus = 'PENDING' | 'CLUSTERED' | 'SKIPPED'

export interface NewsSourceRecord {
  id: string
  name: string
  domain: string
  baseUrl: string
  countryCode: string
  countryName: string | null
  region: string | null
  city: string | null
  district: string | null
  language: string
  timezone: string | null
  sourceType: CrawlerSourceType
  status: CrawlerSourceStatus
  priority: number
  trustTier: number
  discoveryMethod: CrawlerDiscoveryMethod
  rssUrls: string[]
  sitemapUrls: string[]
  listingUrls: string[]
  crawlIntervalSeconds: number
  articleFetchMode: CrawlerArticleFetchMode
  requiresJavascript: boolean
  robotsPolicy: CrawlerRobotsPolicy
  lastDiscoveryAt: Date | null
  nextDiscoveryAt: Date | null
  lastSuccessfulDiscoveryAt: Date | null
  lastFeedEtag: string | null
  lastFeedModified: string | null
  consecutiveFailures: number
  averageResponseMs: number | null
  articlesDiscovered: number
  articlesFetched: number
  extractionSuccessRate: number | null
  geographicScope: GeographicScope
  sourceCategory: CrawlerSourceCategory
  crawlPriority: CrawlPriorityBand
  qualityTier: CrawlerQualityTier
  healthScore: number
  freshnessHours: number
  lastPauseReason: string | null
  registryKey: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DiscoveredUrlRecord {
  id: string
  sourceId: string
  url: string
  normalizedUrl: string
  canonicalUrl: string | null
  urlHash: string
  discoveredAt: Date
  publishedAtHint: Date | null
  status: CrawlerUrlStatus
  fetchAttempts: number
  lastFetchAttempt: Date | null
  failureReason: string | null
  etag: string | null
  lastModified: string | null
  logicalQueue: CrawlerLogicalQueue
}

export interface RawArticleRecord {
  id: string
  sourceId: string
  discoveredUrlId: string | null
  clusterId: string | null
  originalUrl: string
  normalizedUrl: string | null
  canonicalUrl: string | null
  urlHash: string | null
  title: string | null
  description: string | null
  articleBodyText: string | null
  articleBodyHtml: string | null
  author: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  language: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  district: string | null
  mainImageUrl: string | null
  imageUrls: string[]
  videoUrls: string[]
  mediaStatus: CrawlerMediaStatus
  mediaExtractedAt: Date | null
  primaryImageMethod: string | null
  imageCandidateCount: number | null
  imageRejectedCount: number | null
  wordCount: number | null
  charCount: number | null
  paragraphCount: number | null
  contentHash: string | null
  titleHash: string | null
  simhash: string | null
  extractionMethod: string | null
  extractionConfidence: number | null
  httpStatus: number | null
  fetchDurationMs: number | null
  fetchedAt: Date | null
  aiEligibility: CrawlerAiEligibility
  aiSkipReason: string | null
  clusterStatus: CrawlerClusterStatus
  isExactDuplicate: boolean
  duplicateOfId: string | null
  qualityStatus: CrawlerQualityStatus
  boilerplateRatio: number | null
  linkDensity: number | null
  editorialStatus: CrawlerEditorialStatus
  editorialNewsId: string | null
}

export type ClusterEventStatus = 'OPEN' | 'BORDERLINE' | 'CLOSED'
export type ClusterAiEligibility = 'REJECTED' | 'WATCHING' | 'ELIGIBLE' | 'HIGH_PRIORITY'
export type ClusterMatchBand = 'HIGH' | 'BORDERLINE' | 'LOW'

export interface ClusterScoreBreakdown {
  titleSimilarity: number
  tokenOverlap: number
  entityOverlap: number
  timeScore: number
  geoScore: number
  numericOverlap: number
  final: number
}

export interface ClusterMembershipRecord {
  id: string
  clusterId: string
  articleId: string
  sourceId: string
  similarityScore: number
  matchBand: ClusterMatchBand
  matchExplanation: ClusterScoreBreakdown | null
  isCanonical: boolean
  createdAt: Date
}

export interface NewsClusterRecord {
  id: string
  representativeArticleId: string | null
  normalizedTopic: string | null
  countryCode: string | null
  city: string | null
  category: string | null
  articleCount: number
  firstSeenAt: Date
  lastSeenAt: Date
  eventKey: string | null
  canonicalTitle: string | null
  language: string | null
  region: string | null
  district: string | null
  categoryHint: string | null
  eventStatus: ClusterEventStatus
  latestArticleAt: Date | null
  sourceCount: number
  uniqueSourceCount: number
  highQualitySourceCount: number
  sourceDiversityScore: number
  importanceScore: number
  globalImportance: number
  nationalImportance: number
  localImportance: number
  freshnessScore: number
  clusterConfidence: number
  aiEligibility: ClusterAiEligibility
  aiEligibilityReason: string | null
  importanceBreakdown: Record<string, number> | null
  signatureTokens: string[]
  hasMaterialUpdate: boolean
  materialUpdateReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DiscoveredFeedItem {
  url: string
  title?: string | null
  publishedAt?: Date | null
}

export interface ExtractedArticleContent {
  title: string | null
  description: string | null
  articleBodyText: string
  articleBodyHtml: string
  author: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  language: string | null
  canonicalUrl: string | null
  mainImageUrl: string | null
  imageUrls: string[]
  videoUrls: string[]
  wordCount: number
  charCount: number
  paragraphCount: number
  extractionMethod: string
  extractionConfidence: number
}

export type CrawlerMetricName =
  | 'sources_checked'
  | 'urls_discovered'
  | 'urls_new'
  | 'articles_fetched'
  | 'extraction_success'
  | 'extraction_fail'
  | 'duplicates_removed'
  | 'ai_candidates'
  | 'ai_requests'
  | 'ai_requests_avoided'
  | 'http_requests'
  | 'browser_requests'
  | 'fetch_duration_ms_sum'
  | 'fetch_duration_count'
  | 'failed_sources'
  | 'low_confidence'
  | 'stale_skipped'
  | 'clusters_created'
  | 'articles_clustered'
  | 'borderline_matches'
  | 'eligible_clusters'
  | 'watching_clusters'
  | 'rejected_clusters'
  | 'high_priority_clusters'
  | 'single_source_clusters'
  | 'multi_source_clusters'
  | 'http_429'
  | 'articles_with_primary_image'
  | 'articles_without_image'
  | 'image_candidates_found'
  | 'image_candidates_rejected'
  | 'image_extraction_failed'
  | 'primary_image_jsonld'
  | 'primary_image_og'
  | 'primary_image_dom'
  | 'image_coverage_rate'
  | 'image_duplicates_removed'
  | 'image_ads_rejected'
  | 'image_logos_rejected'
  | 'image_tiny_rejected'
  | 'image_accepted'
  | 'legacy_rss_urls_discovered'
  | 'legacy_rss_urls_new'
  | 'legacy_rss_urls_duplicate'
  | 'legacy_rss_forwarded_to_crawler'
  | 'legacy_direct_ai_blocked'
  | 'legacy_cron_noop'
  | 'unmapped_legacy_source'
  | 'cross_pipeline_duplicate'

export interface CrawlerLogFields {
  sourceId?: string
  url?: string
  stage: string
  durationMs?: number
  httpStatus?: number
  extractionMethod?: string
  confidence?: number
  retryCount?: number
  errorCode?: string
}
