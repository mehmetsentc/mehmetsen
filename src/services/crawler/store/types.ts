import { randomUUID } from 'node:crypto'
import type {
  CrawlerLogicalQueue,
  CrawlerMetricName,
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
}

export interface InsertDiscoveredUrlInput {
  sourceId: string
  url: string
  normalizedUrl: string
  urlHash: string
  publishedAtHint?: Date | null
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
  insertCluster(input: {
    representativeArticleId: string
    normalizedTopic: string
    countryCode: string | null
    city: string | null
  }): Promise<NewsClusterRecord>
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
      >
    >
  ): Promise<void>
  clusterHasEligible(clusterId: string): Promise<boolean>
  hasAiCache(contentHash: string, promptVersion: string, model: string): Promise<boolean>

  incrementMetric(metric: CrawlerMetricName, amount?: number, now?: Date): Promise<void>
  getTodayMetrics(now?: Date): Promise<Record<string, number>>
  countActiveSources(): Promise<number>
  countFailedSources(): Promise<number>
}
