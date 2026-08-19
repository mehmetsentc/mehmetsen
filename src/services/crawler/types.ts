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
