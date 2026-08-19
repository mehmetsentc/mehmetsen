import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  aiProcessingCache,
  clusterMemberships,
  crawlerArticleMedia,
  crawlerEditorialAudit,
  crawlerMetricsDaily,
  discoveredArticleUrls,
  newsClusters,
  newsSources,
  rawArticles,
} from '@/db/schema/crawler'
import type {
  ArticleMediaRecord,
  CrawlerLogicalQueue,
  CrawlerMetricName,
  CrawlerUrlStatus,
  CrawlerEditorialAuditRecord,
  DiscoveredUrlRecord,
  NewsClusterRecord,
  NewsSourceRecord,
  RawArticleRecord,
} from '../types'
import { ACTIVE_EDITORIAL_STATUSES, clampPage, clampPageSize, queueCountsFromStatuses, type ClusterListQuery } from '../editorial/query'
import { crawlerEditorialStaleHours, emptyClusterFunnel } from '../editorial/controlPlane'
import type {
  CrawlerStore,
  InsertClusterInput,
  InsertDiscoveredUrlInput,
  InsertRawArticleInput,
  InsertSourceInput,
  RawArticleListQuery,
  RawArticleListResult,
  RawArticleListRow,
  RawArticleSourceFacet,
} from './types'
import { newCrawlerId } from './types'
import { clusterDefaults } from '../cluster/defaults'
import type { ClusterMembershipRecord, ClusterScoreBreakdown } from '../types'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function mapSource(row: typeof newsSources.$inferSelect): NewsSourceRecord {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    baseUrl: row.baseUrl,
    countryCode: row.countryCode,
    countryName: row.countryName,
    region: row.region,
    city: row.city,
    district: row.district,
    language: row.language,
    timezone: row.timezone,
    sourceType: row.sourceType,
    status: row.status,
    priority: row.priority,
    trustTier: row.trustTier,
    discoveryMethod: row.discoveryMethod,
    rssUrls: strings(row.rssUrls),
    sitemapUrls: strings(row.sitemapUrls),
    listingUrls: strings(row.listingUrls),
    crawlIntervalSeconds: row.crawlIntervalSeconds,
    articleFetchMode: row.articleFetchMode,
    requiresJavascript: row.requiresJavascript === 1,
    robotsPolicy: row.robotsPolicy,
    lastDiscoveryAt: row.lastDiscoveryAt,
    nextDiscoveryAt: row.nextDiscoveryAt,
    lastSuccessfulDiscoveryAt: row.lastSuccessfulDiscoveryAt,
    lastFeedEtag: row.lastFeedEtag,
    lastFeedModified: row.lastFeedModified,
    consecutiveFailures: row.consecutiveFailures,
    averageResponseMs: row.averageResponseMs,
    articlesDiscovered: row.articlesDiscovered,
    articlesFetched: row.articlesFetched,
    extractionSuccessRate: row.extractionSuccessRate,
    geographicScope: (row.geographicScope as NewsSourceRecord['geographicScope']) || 'NATIONAL',
    sourceCategory: (row.sourceCategory as NewsSourceRecord['sourceCategory']) || 'GENERAL',
    crawlPriority: (row.crawlPriority as NewsSourceRecord['crawlPriority']) || 'NORMAL',
    qualityTier: (row.qualityTier as NewsSourceRecord['qualityTier']) || 'UNTESTED',
    healthScore: row.healthScore ?? 50,
    freshnessHours: row.freshnessHours ?? 48,
    lastPauseReason: row.lastPauseReason,
    registryKey: row.registryKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapUrl(row: typeof discoveredArticleUrls.$inferSelect): DiscoveredUrlRecord {
  return {
    id: row.id,
    sourceId: row.sourceId,
    url: row.url,
    normalizedUrl: row.normalizedUrl,
    canonicalUrl: row.canonicalUrl,
    urlHash: row.urlHash,
    discoveredAt: row.discoveredAt,
    publishedAtHint: row.publishedAtHint,
    status: row.status,
    fetchAttempts: row.fetchAttempts,
    lastFetchAttempt: row.lastFetchAttempt,
    failureReason: row.failureReason,
    etag: row.etag,
    lastModified: row.lastModified,
    logicalQueue: row.logicalQueue as CrawlerLogicalQueue,
  }
}

function mapRaw(row: typeof rawArticles.$inferSelect): RawArticleRecord {
  return {
    id: row.id,
    sourceId: row.sourceId,
    discoveredUrlId: row.discoveredUrlId,
    clusterId: row.clusterId,
    originalUrl: row.originalUrl,
    normalizedUrl: row.normalizedUrl,
    canonicalUrl: row.canonicalUrl,
    urlHash: row.urlHash,
    title: row.title,
    description: row.description,
    articleBodyText: row.articleBodyText,
    articleBodyHtml: row.articleBodyHtml,
    author: row.author,
    publishedAt: row.publishedAt,
    modifiedAt: row.modifiedAt,
    language: row.language,
    countryCode: row.countryCode,
    region: row.region,
    city: row.city,
    district: row.district,
    mainImageUrl: row.mainImageUrl,
    imageUrls: strings(row.imageUrls),
    videoUrls: strings(row.videoUrls),
    wordCount: row.wordCount,
    charCount: row.charCount,
    paragraphCount: row.paragraphCount,
    contentHash: row.contentHash,
    titleHash: row.titleHash,
    simhash: row.simhash,
    extractionMethod: row.extractionMethod,
    extractionConfidence: row.extractionConfidence,
    httpStatus: row.httpStatus,
    fetchDurationMs: row.fetchDurationMs,
    fetchedAt: row.fetchedAt,
    aiEligibility: row.aiEligibility,
    aiSkipReason: row.aiSkipReason,
    clusterStatus: row.clusterStatus,
    isExactDuplicate: row.isExactDuplicate === 1,
    duplicateOfId: row.duplicateOfId,
    qualityStatus: (row.qualityStatus as RawArticleRecord['qualityStatus']) || 'EXTRACTED',
    boilerplateRatio: row.boilerplateRatio,
    linkDensity: row.linkDensity,
    mediaStatus: (row.mediaStatus as RawArticleRecord['mediaStatus']) || 'PENDING',
    mediaExtractedAt: row.mediaExtractedAt,
    primaryImageMethod: row.primaryImageMethod,
    imageCandidateCount: row.imageCandidateCount,
    imageRejectedCount: row.imageRejectedCount,
    editorialStatus: (row.editorialStatus as RawArticleRecord['editorialStatus']) || 'NEW',
    editorialNewsId: row.editorialNewsId,
    rejectionReason: (row.rejectionReason as RawArticleRecord['rejectionReason']) || null,
    rejectionNote: row.rejectionNote ?? null,
    rejectedAt: row.rejectedAt ?? null,
    rejectedBy: row.rejectedBy ?? null,
  }
}

function mapMedia(row: typeof crawlerArticleMedia.$inferSelect): ArticleMediaRecord {
  return {
    id: row.id,
    articleId: row.articleId,
    mediaType: row.mediaType,
    sourceUrl: row.sourceUrl,
    normalizedUrl: row.normalizedUrl,
    width: row.width,
    height: row.height,
    altText: row.altText,
    caption: row.caption,
    credit: row.credit,
    mimeType: row.mimeType,
    discoveryMethod: row.discoveryMethod,
    score: row.score,
    isPrimary: row.isPrimary === 1,
    status: row.status === 'REJECTED' ? 'REJECTED' : 'ACCEPTED',
    rejectionReason: row.rejectionReason,
    qualityScore: row.qualityScore ?? row.score,
    contentHash: row.contentHash ?? null,
    perceptualHash: row.perceptualHash ?? null,
    imageSource: row.imageSource ?? null,
    imageConfidence: row.imageConfidence ?? null,
    createdAt: row.createdAt,
  }
}

function mapCluster(row: typeof newsClusters.$inferSelect): NewsClusterRecord {
  const fallback = clusterDefaults(row.updatedAt)
  return {
    id: row.id,
    representativeArticleId: row.representativeArticleId,
    normalizedTopic: row.normalizedTopic,
    countryCode: row.countryCode,
    city: row.city,
    category: row.category,
    articleCount: row.articleCount,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    eventKey: row.eventKey ?? null,
    canonicalTitle: row.canonicalTitle ?? null,
    language: row.language ?? null,
    region: row.region ?? null,
    district: row.district ?? null,
    categoryHint: row.categoryHint ?? null,
    eventStatus: (row.eventStatus as NewsClusterRecord['eventStatus']) || 'OPEN',
    latestArticleAt: row.latestArticleAt ?? row.lastSeenAt,
    sourceCount: row.sourceCount ?? 1,
    uniqueSourceCount: row.uniqueSourceCount ?? 1,
    highQualitySourceCount: row.highQualitySourceCount ?? 0,
    sourceDiversityScore: row.sourceDiversityScore ?? 0,
    importanceScore: row.importanceScore ?? 0,
    globalImportance: row.globalImportance ?? 0,
    nationalImportance: row.nationalImportance ?? 0,
    localImportance: row.localImportance ?? 0,
    freshnessScore: row.freshnessScore ?? 0,
    clusterConfidence: row.clusterConfidence ?? 0,
    aiEligibility: (row.aiEligibility as NewsClusterRecord['aiEligibility']) || 'WATCHING',
    aiEligibilityReason: row.aiEligibilityReason ?? null,
    editorialDecision: (row.editorialDecision as NewsClusterRecord['editorialDecision']) || 'NONE',
    editorialDecisionReason: row.editorialDecisionReason ?? null,
    editorialDecisionNote: row.editorialDecisionNote ?? null,
    editorialDecidedAt: row.editorialDecidedAt ?? null,
    editorialDecidedBy: row.editorialDecidedBy ?? null,
    editorialPriority: (row.editorialPriority as NewsClusterRecord['editorialPriority']) || 'NORMAL',
    approvalSource: (row.approvalSource as NewsClusterRecord['approvalSource']) || null,
    importanceBreakdown: (row.importanceBreakdown as Record<string, number> | null) ?? null,
    signatureTokens: Array.isArray(row.signatureTokens) ? row.signatureTokens : [],
    hasMaterialUpdate: row.hasMaterialUpdate === 1,
    materialUpdateReason: row.materialUpdateReason ?? null,
    createdAt: row.createdAt ?? fallback.createdAt,
    updatedAt: row.updatedAt ?? fallback.updatedAt,
  }
}

function mapMembership(row: typeof clusterMemberships.$inferSelect): ClusterMembershipRecord {
  return {
    id: row.id,
    clusterId: row.clusterId,
    articleId: row.articleId,
    sourceId: row.sourceId,
    similarityScore: row.similarityScore,
    matchBand: (row.matchBand as ClusterMembershipRecord['matchBand']) || 'LOW',
    matchExplanation: (row.matchExplanation as ClusterScoreBreakdown | null) ?? null,
    isCanonical: row.isCanonical === 1,
    createdAt: row.createdAt,
  }
}

function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function canUseDrizzleCrawlerStore(): boolean {
  return hasDatabaseUrl()
}

export class DrizzleCrawlerStore implements CrawlerStore {
  private db() {
    return getDb()
  }

  async listSources(): Promise<NewsSourceRecord[]> {
    const rows = await this.db().select().from(newsSources).orderBy(newsSources.name)
    return rows.map(mapSource)
  }

  async getSource(id: string): Promise<NewsSourceRecord | null> {
    const rows = await this.db().select().from(newsSources).where(eq(newsSources.id, id)).limit(1)
    return rows[0] ? mapSource(rows[0]) : null
  }

  async insertSource(input: InsertSourceInput): Promise<NewsSourceRecord> {
    const id = newCrawlerId('src')
    const now = new Date()
    await this.db().insert(newsSources).values({
      id,
      name: input.name,
      domain: input.domain.toLowerCase(),
      baseUrl: input.baseUrl,
      countryCode: input.countryCode.toUpperCase(),
      countryName: input.countryName ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      district: input.district ?? null,
      language: input.language,
      timezone: input.timezone ?? null,
      sourceType: input.sourceType ?? 'OTHER',
      status: input.status ?? 'PAUSED',
      priority: input.priority ?? 50,
      trustTier: input.trustTier ?? 3,
      discoveryMethod: input.discoveryMethod ?? 'RSS',
      rssUrls: input.rssUrls ?? [],
      sitemapUrls: input.sitemapUrls ?? [],
      listingUrls: input.listingUrls ?? [],
      crawlIntervalSeconds: input.crawlIntervalSeconds ?? 300,
      articleFetchMode: input.articleFetchMode ?? 'AUTO',
      requiresJavascript: input.requiresJavascript ? 1 : 0,
      robotsPolicy: input.robotsPolicy ?? 'FOLLOW',
      nextDiscoveryAt: now,
      geographicScope: input.geographicScope ?? 'NATIONAL',
      sourceCategory: input.sourceCategory ?? 'GENERAL',
      crawlPriority: input.crawlPriority ?? 'NORMAL',
      qualityTier: input.qualityTier ?? 'UNTESTED',
      healthScore: input.healthScore ?? 50,
      freshnessHours: input.freshnessHours ?? 48,
      registryKey: input.registryKey ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.getSource(id)
    if (!created) throw new Error('source_insert_failed')
    return created
  }

  async updateSource(id: string, patch: Partial<NewsSourceRecord>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date() }
    const assign = <K extends keyof NewsSourceRecord>(key: K, column: string) => {
      if (patch[key] !== undefined) values[column] = patch[key]
    }
    assign('status', 'status')
    assign('lastDiscoveryAt', 'lastDiscoveryAt')
    assign('nextDiscoveryAt', 'nextDiscoveryAt')
    assign('lastSuccessfulDiscoveryAt', 'lastSuccessfulDiscoveryAt')
    assign('lastFeedEtag', 'lastFeedEtag')
    assign('lastFeedModified', 'lastFeedModified')
    assign('consecutiveFailures', 'consecutiveFailures')
    assign('averageResponseMs', 'averageResponseMs')
    assign('articlesDiscovered', 'articlesDiscovered')
    assign('articlesFetched', 'articlesFetched')
    assign('extractionSuccessRate', 'extractionSuccessRate')
    assign('healthScore', 'healthScore')
    assign('qualityTier', 'qualityTier')
    assign('lastPauseReason', 'lastPauseReason')
    assign('freshnessHours', 'freshnessHours')
    assign('crawlPriority', 'crawlPriority')
    await this.db().update(newsSources).set(values).where(eq(newsSources.id, id))
  }

  async listDueSources(now: Date, limit: number): Promise<NewsSourceRecord[]> {
    const rows = await this.db()
      .select()
      .from(newsSources)
      .where(
        and(
          or(eq(newsSources.status, 'ACTIVE'), eq(newsSources.status, 'DEGRADED')),
          or(sql`${newsSources.nextDiscoveryAt} is null`, lte(newsSources.nextDiscoveryAt, now))
        )
      )
      .orderBy(desc(newsSources.priority))
      .limit(limit)
    return rows.map(mapSource)
  }

  async countDueSources(now: Date): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(newsSources)
      .where(
        and(
          or(eq(newsSources.status, 'ACTIVE'), eq(newsSources.status, 'DEGRADED')),
          or(sql`${newsSources.nextDiscoveryAt} is null`, lte(newsSources.nextDiscoveryAt, now))
        )
      )
    return rows[0]?.n ?? 0
  }

  async insertDiscoveredUrl(input: InsertDiscoveredUrlInput): Promise<'inserted' | 'duplicate'> {
    const existing = await this.getDiscoveredByHash(input.urlHash)
    if (existing) return 'duplicate'
    try {
      await this.db().insert(discoveredArticleUrls).values({
        id: newCrawlerId('url'),
        sourceId: input.sourceId,
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        urlHash: input.urlHash,
        publishedAtHint: input.publishedAtHint ?? null,
        status: 'PENDING_FETCH',
        logicalQueue: 'ARTICLE_FETCH_QUEUE',
      })
      return 'inserted'
    } catch {
      return 'duplicate'
    }
  }

  async getDiscoveredByHash(urlHash: string): Promise<DiscoveredUrlRecord | null> {
    const rows = await this.db()
      .select()
      .from(discoveredArticleUrls)
      .where(eq(discoveredArticleUrls.urlHash, urlHash))
      .limit(1)
    return rows[0] ? mapUrl(rows[0]) : null
  }

  async listPendingFetch(limit: number): Promise<DiscoveredUrlRecord[]> {
    const rows = await this.db()
      .select()
      .from(discoveredArticleUrls)
      .where(eq(discoveredArticleUrls.status, 'PENDING_FETCH'))
      .orderBy(discoveredArticleUrls.discoveredAt)
      .limit(limit)
    return rows.map(mapUrl)
  }

  async updateDiscoveredUrl(id: string, patch: Partial<DiscoveredUrlRecord>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.status !== undefined) values.status = patch.status
    if (patch.canonicalUrl !== undefined) values.canonicalUrl = patch.canonicalUrl
    if (patch.fetchAttempts !== undefined) values.fetchAttempts = patch.fetchAttempts
    if (patch.lastFetchAttempt !== undefined) values.lastFetchAttempt = patch.lastFetchAttempt
    if (patch.failureReason !== undefined) values.failureReason = patch.failureReason
    if (patch.etag !== undefined) values.etag = patch.etag
    if (patch.lastModified !== undefined) values.lastModified = patch.lastModified
    if (patch.logicalQueue !== undefined) values.logicalQueue = patch.logicalQueue
    await this.db().update(discoveredArticleUrls).set(values).where(eq(discoveredArticleUrls.id, id))
  }

  async countByStatus(status: CrawlerUrlStatus): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(discoveredArticleUrls)
      .where(eq(discoveredArticleUrls.status, status))
    return rows[0]?.n ?? 0
  }

  async countQueue(queue: CrawlerLogicalQueue): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(discoveredArticleUrls)
      .where(eq(discoveredArticleUrls.logicalQueue, queue))
    return rows[0]?.n ?? 0
  }

  async insertRawArticle(input: InsertRawArticleInput): Promise<RawArticleRecord> {
    const id = newCrawlerId('raw')
    await this.db().insert(rawArticles).values({
      id,
      sourceId: input.sourceId,
      discoveredUrlId: input.discoveredUrlId,
      clusterId: input.clusterId ?? null,
      originalUrl: input.originalUrl,
      normalizedUrl: input.normalizedUrl,
      canonicalUrl: input.canonicalUrl,
      urlHash: input.urlHash,
      title: input.title,
      description: input.description,
      articleBodyText: input.articleBodyText,
      articleBodyHtml: input.articleBodyHtml,
      author: input.author,
      publishedAt: input.publishedAt,
      modifiedAt: input.modifiedAt,
      language: input.language,
      countryCode: input.countryCode,
      region: input.region,
      city: input.city,
      district: input.district,
      mainImageUrl: input.mainImageUrl,
      imageUrls: input.imageUrls,
      videoUrls: input.videoUrls,
      wordCount: input.wordCount,
      charCount: input.charCount,
      paragraphCount: input.paragraphCount,
      contentHash: input.contentHash,
      titleHash: input.titleHash,
      simhash: input.simhash,
      extractionMethod: input.extractionMethod,
      extractionConfidence: input.extractionConfidence,
      httpStatus: input.httpStatus,
      fetchDurationMs: input.fetchDurationMs,
      fetchedAt: input.fetchedAt,
      aiEligibility: input.aiEligibility ?? 'PENDING',
      aiSkipReason: input.aiSkipReason ?? null,
      clusterStatus: input.clusterStatus ?? 'PENDING',
      isExactDuplicate: input.isExactDuplicate ? 1 : 0,
      duplicateOfId: input.duplicateOfId ?? null,
      qualityStatus: input.qualityStatus ?? 'EXTRACTED',
      boilerplateRatio: input.boilerplateRatio ?? null,
      linkDensity: input.linkDensity ?? null,
      mediaStatus: input.mediaStatus ?? 'PENDING',
      mediaExtractedAt: input.mediaExtractedAt ?? null,
      primaryImageMethod: input.primaryImageMethod ?? null,
      imageCandidateCount: input.imageCandidateCount ?? null,
      imageRejectedCount: input.imageRejectedCount ?? null,
      editorialStatus: input.editorialStatus ?? 'NEW',
      editorialNewsId: input.editorialNewsId ?? null,
    })
    const rows = await this.db().select().from(rawArticles).where(eq(rawArticles.id, id)).limit(1)
    return mapRaw(rows[0])
  }

  async getRawArticle(id: string): Promise<RawArticleRecord | null> {
    const rows = await this.db().select().from(rawArticles).where(eq(rawArticles.id, id)).limit(1)
    return rows[0] ? mapRaw(rows[0]) : null
  }

  async listRecentArticles(limit = 50): Promise<RawArticleRecord[]> {
    const rows = await this.db().select().from(rawArticles).orderBy(desc(rawArticles.fetchedAt)).limit(limit)
    return rows.map(mapRaw)
  }

  async findRawByContentHash(hash: string): Promise<RawArticleRecord | null> {
    const rows = await this.db().select().from(rawArticles).where(eq(rawArticles.contentHash, hash)).limit(1)
    return rows[0] ? mapRaw(rows[0]) : null
  }

  async findRawByTitleHash(hash: string): Promise<RawArticleRecord | null> {
    const rows = await this.db().select().from(rawArticles).where(eq(rawArticles.titleHash, hash)).limit(1)
    return rows[0] ? mapRaw(rows[0]) : null
  }

  async findRawByCanonicalUrl(url: string): Promise<RawArticleRecord | null> {
    const rows = await this.db().select().from(rawArticles).where(eq(rawArticles.canonicalUrl, url)).limit(1)
    return rows[0] ? mapRaw(rows[0]) : null
  }

  async recentRawForNearDup(sourceCountry: string | null, limit = 40): Promise<RawArticleRecord[]> {
    const q = this.db().select().from(rawArticles)
    const rows = sourceCountry
      ? await q.where(eq(rawArticles.countryCode, sourceCountry)).orderBy(desc(rawArticles.fetchedAt)).limit(limit)
      : await q.orderBy(desc(rawArticles.fetchedAt)).limit(limit)
    return rows.map(mapRaw)
  }

  async recentClusters(countryCode: string | null, since: Date) {
    const rows = await this.db()
      .select()
      .from(newsClusters)
      .where(
        and(
          gte(newsClusters.lastSeenAt, since),
          countryCode ? eq(newsClusters.countryCode, countryCode) : sql`true`
        )
      )
      .orderBy(desc(newsClusters.lastSeenAt))
      .limit(80)
    const out = []
    for (const row of rows) {
      const cluster = mapCluster(row)
      let representativeTitle: string | null = null
      let representativeSimhash: string | null = null
      if (row.representativeArticleId) {
        const arts = await this.db()
          .select()
          .from(rawArticles)
          .where(eq(rawArticles.id, row.representativeArticleId))
          .limit(1)
        representativeTitle = arts[0]?.title ?? null
        representativeSimhash = arts[0]?.simhash ?? null
      }
      out.push({ ...cluster, representativeTitle, representativeSimhash })
    }
    return out
  }

  async insertCluster(input: InsertClusterInput): Promise<NewsClusterRecord> {
    const id = newCrawlerId('cl')
    const now = new Date()
    const extras = clusterDefaults(now)
    await this.db().insert(newsClusters).values({
      id,
      representativeArticleId: input.representativeArticleId,
      normalizedTopic: input.normalizedTopic,
      countryCode: input.countryCode,
      city: input.city,
      firstSeenAt: now,
      lastSeenAt: now,
      eventKey: input.eventKey ?? extras.eventKey,
      canonicalTitle: input.canonicalTitle ?? extras.canonicalTitle,
      language: input.language ?? extras.language,
      region: input.region ?? extras.region,
      district: input.district ?? extras.district,
      categoryHint: input.categoryHint ?? extras.categoryHint,
      eventStatus: extras.eventStatus,
      latestArticleAt: now,
      signatureTokens: input.signatureTokens ?? [],
      createdAt: now,
      updatedAt: now,
    })
    const rows = await this.db().select().from(newsClusters).where(eq(newsClusters.id, id)).limit(1)
    return mapCluster(rows[0])
  }

  async updateCluster(id: string, patch: Partial<NewsClusterRecord>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date() }
    const assign = (key: keyof NewsClusterRecord, column: string, transform?: (v: unknown) => unknown) => {
      if (patch[key] !== undefined) values[column] = transform ? transform(patch[key]) : patch[key]
    }
    assign('representativeArticleId', 'representativeArticleId')
    assign('normalizedTopic', 'normalizedTopic')
    assign('canonicalTitle', 'canonicalTitle')
    assign('eventKey', 'eventKey')
    assign('language', 'language')
    assign('countryCode', 'countryCode')
    assign('region', 'region')
    assign('city', 'city')
    assign('district', 'district')
    assign('categoryHint', 'categoryHint')
    assign('eventStatus', 'eventStatus')
    assign('latestArticleAt', 'latestArticleAt')
    assign('lastSeenAt', 'lastSeenAt')
    assign('articleCount', 'articleCount')
    assign('sourceCount', 'sourceCount')
    assign('uniqueSourceCount', 'uniqueSourceCount')
    assign('highQualitySourceCount', 'highQualitySourceCount')
    assign('sourceDiversityScore', 'sourceDiversityScore')
    assign('importanceScore', 'importanceScore')
    assign('globalImportance', 'globalImportance')
    assign('nationalImportance', 'nationalImportance')
    assign('localImportance', 'localImportance')
    assign('freshnessScore', 'freshnessScore')
    assign('clusterConfidence', 'clusterConfidence')
    assign('aiEligibility', 'aiEligibility')
    assign('aiEligibilityReason', 'aiEligibilityReason')
    assign('editorialDecision', 'editorialDecision')
    assign('editorialDecisionReason', 'editorialDecisionReason')
    assign('editorialDecisionNote', 'editorialDecisionNote')
    assign('editorialDecidedAt', 'editorialDecidedAt')
    assign('editorialDecidedBy', 'editorialDecidedBy')
    assign('editorialPriority', 'editorialPriority')
    assign('approvalSource', 'approvalSource')
    assign('importanceBreakdown', 'importanceBreakdown')
    assign('signatureTokens', 'signatureTokens')
    assign('hasMaterialUpdate', 'hasMaterialUpdate', (v) => (v ? 1 : 0))
    assign('materialUpdateReason', 'materialUpdateReason')
    await this.db().update(newsClusters).set(values).where(eq(newsClusters.id, id))
  }

  async getCluster(id: string): Promise<NewsClusterRecord | null> {
    const rows = await this.db().select().from(newsClusters).where(eq(newsClusters.id, id)).limit(1)
    return rows[0] ? mapCluster(rows[0]) : null
  }

  async listClusters(opts?: {
    since?: Date
    countryCode?: string | null
    city?: string | null
    eligibility?: string | null
    editorialDecision?: string | null
    minSources?: number
    limit?: number
  }): Promise<NewsClusterRecord[]> {
    const conds: SQL[] = []
    if (opts?.since) conds.push(gte(newsClusters.lastSeenAt, opts.since))
    if (opts?.countryCode) conds.push(eq(newsClusters.countryCode, opts.countryCode))
    if (opts?.city) conds.push(sql`lower(${newsClusters.city}) = lower(${opts.city})`)
    if (opts?.eligibility) conds.push(eq(newsClusters.aiEligibility, opts.eligibility))
    if (opts?.editorialDecision) conds.push(eq(newsClusters.editorialDecision, opts.editorialDecision))
    if (opts?.minSources) conds.push(gte(newsClusters.uniqueSourceCount, opts.minSources))
    const rows = await this.db()
      .select()
      .from(newsClusters)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(newsClusters.lastSeenAt))
      .limit(opts?.limit ?? 500)
    return rows.map(mapCluster)
  }

  private clusterWhere(query: ClusterListQuery, now = new Date()): SQL | undefined {
    const conds: SQL[] = []
    if (query.country) conds.push(sql`upper(${newsClusters.countryCode}) = ${query.country.toUpperCase()}`)
    if (query.city) conds.push(sql`lower(${newsClusters.city}) = lower(${query.city})`)
    if (query.district) conds.push(sql`lower(${newsClusters.district}) = lower(${query.district})`)
    if (query.eligibility) conds.push(eq(newsClusters.aiEligibility, query.eligibility))
    if (query.editorialDecision) conds.push(eq(newsClusters.editorialDecision, query.editorialDecision))
    if (query.editorialPriority) conds.push(eq(newsClusters.editorialPriority, query.editorialPriority))
    if (query.minSources) conds.push(gte(newsClusters.uniqueSourceCount, query.minSources))
    if (query.minArticles) conds.push(gte(newsClusters.articleCount, query.minArticles))
    if (query.minImportance != null) conds.push(gte(newsClusters.importanceScore, query.minImportance))
    if (query.minConfidence != null) conds.push(gte(newsClusters.clusterConfidence, query.minConfidence))
    if (query.since) conds.push(gte(newsClusters.lastSeenAt, query.since))
    if (query.maxAgeHours != null) {
      conds.push(gte(newsClusters.firstSeenAt, new Date(now.getTime() - query.maxAgeHours * 3600000)))
    }
    if (query.dateFrom) conds.push(gte(newsClusters.firstSeenAt, query.dateFrom))
    if (query.dateTo) conds.push(lte(newsClusters.firstSeenAt, query.dateTo))
    if (query.sourceId) {
      conds.push(
        sql`exists (select 1 from ${clusterMemberships} cm where cm.cluster_id = ${newsClusters.id} and cm.source_id = ${query.sourceId})`
      )
    }
    switch (query.tab) {
      case 'watching':
        conds.push(
          sql`(${newsClusters.editorialDecision} = 'WATCHING' or (${newsClusters.aiEligibility} = 'WATCHING' and ${newsClusters.editorialDecision} not in ('ARCHIVED','REJECTED')))`
        )
        break
      case 'eligible':
        conds.push(eq(newsClusters.aiEligibility, 'ELIGIBLE'))
        break
      case 'high':
        conds.push(eq(newsClusters.aiEligibility, 'HIGH_PRIORITY'))
        break
      case 'approved':
        conds.push(eq(newsClusters.editorialDecision, 'APPROVED_FOR_AI'))
        break
      case 'rejected':
        conds.push(
          sql`(${newsClusters.editorialDecision} = 'REJECTED' or ${newsClusters.aiEligibility} = 'REJECTED')`
        )
        break
      case 'archived':
        conds.push(eq(newsClusters.editorialDecision, 'ARCHIVED'))
        break
      default:
        break
    }
    return conds.length ? and(...conds) : undefined
  }

  async listClustersMatching(query: ClusterListQuery): Promise<NewsClusterRecord[]> {
    const rows = await this.db()
      .select()
      .from(newsClusters)
      .where(this.clusterWhere(query))
      .orderBy(desc(newsClusters.lastSeenAt))
    return rows.map(mapCluster)
  }

  async listClustersPage(query: ClusterListQuery) {
    const pageSize = clampPageSize(query.pageSize)
    const where = this.clusterWhere(query)
    const countRows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(newsClusters)
      .where(where)
    const total = countRows[0]?.n ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
    const page = clampPage(query.page, totalPages)
    const rows = await this.db()
      .select()
      .from(newsClusters)
      .where(where)
      .orderBy(desc(newsClusters.lastSeenAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
    return { clusters: rows.map(mapCluster), total, page, pageSize, totalPages }
  }

  async listClusterIdsMatching(query: ClusterListQuery, cap: number): Promise<{ ids: string[]; total: number }> {
    const where = this.clusterWhere(query)
    const countRows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(newsClusters)
      .where(where)
    const total = countRows[0]?.n ?? 0
    if (total > cap) return { ids: [], total }
    const rows = await this.db()
      .select({ id: newsClusters.id })
      .from(newsClusters)
      .where(where)
      .orderBy(desc(newsClusters.lastSeenAt))
      .limit(Math.max(0, cap))
    return { ids: rows.map((r) => r.id), total }
  }

  async countClusterFunnel(now = new Date()) {
    const staleHours = crawlerEditorialStaleHours()
    const staleCutoff = new Date(now.getTime() - staleHours * 3600000)
    const dayCutoff = new Date(now.getTime() - 24 * 3600000)
    const rows = await this.db()
      .select({
        total: sql<number>`count(*)::int`,
        watching: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'WATCHING' or (${newsClusters.aiEligibility} = 'WATCHING' and ${newsClusters.editorialDecision} not in ('ARCHIVED','REJECTED')))::int`,
        eligible: sql<number>`count(*) filter (where ${newsClusters.aiEligibility} = 'ELIGIBLE')::int`,
        highPriority: sql<number>`count(*) filter (where ${newsClusters.aiEligibility} = 'HIGH_PRIORITY')::int`,
        approvedForAi: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'APPROVED_FOR_AI')::int`,
        rejected: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'REJECTED' or ${newsClusters.aiEligibility} = 'REJECTED')::int`,
        archived: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'ARCHIVED')::int`,
        singleSource: sql<number>`count(*) filter (where ${newsClusters.uniqueSourceCount} <= 1)::int`,
        multiSource: sql<number>`count(*) filter (where ${newsClusters.uniqueSourceCount} >= 2)::int`,
        staleApproved: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'APPROVED_FOR_AI' and ${newsClusters.firstSeenAt} < ${staleCutoff})::int`,
        olderThan24h: sql<number>`count(*) filter (where ${newsClusters.firstSeenAt} < ${dayCutoff})::int`,
        breaking: sql<number>`count(*) filter (where ${newsClusters.editorialPriority} = 'BREAKING')::int`,
        editorialHigh: sql<number>`count(*) filter (where ${newsClusters.editorialPriority} = 'HIGH')::int`,
      })
      .from(newsClusters)
    return { ...emptyClusterFunnel(), ...(rows[0] || {}) }
  }

  async countClusterTabs(query: ClusterListQuery) {
    const where = this.clusterWhere({ ...query, tab: '' })
    const rows = await this.db()
      .select({
        all: sql<number>`count(*)::int`,
        watching: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'WATCHING' or (${newsClusters.aiEligibility} = 'WATCHING' and ${newsClusters.editorialDecision} not in ('ARCHIVED','REJECTED')))::int`,
        eligible: sql<number>`count(*) filter (where ${newsClusters.aiEligibility} = 'ELIGIBLE')::int`,
        high: sql<number>`count(*) filter (where ${newsClusters.aiEligibility} = 'HIGH_PRIORITY')::int`,
        approved: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'APPROVED_FOR_AI')::int`,
        rejected: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'REJECTED' or ${newsClusters.aiEligibility} = 'REJECTED')::int`,
        archived: sql<number>`count(*) filter (where ${newsClusters.editorialDecision} = 'ARCHIVED')::int`,
      })
      .from(newsClusters)
      .where(where)
    return rows[0] || { all: 0, watching: 0, eligible: 0, high: 0, approved: 0, rejected: 0, archived: 0 }
  }

  async countRawArticles(opts?: { excludeDeleted?: boolean }): Promise<number> {
    const where = opts?.excludeDeleted === false ? undefined : sql`${rawArticles.editorialStatus} <> 'DELETED'`
    const rows = await this.db().select({ n: sql<number>`count(*)::int` }).from(rawArticles).where(where)
    return rows[0]?.n ?? 0
  }

  async listPendingClusterArticles(limit: number): Promise<RawArticleRecord[]> {
    const members = await this.db().select({ articleId: clusterMemberships.articleId }).from(clusterMemberships)
    const taken = new Set(members.map((m) => m.articleId))
    const rows = await this.db()
      .select()
      .from(rawArticles)
      .orderBy(desc(rawArticles.fetchedAt))
      .limit(Math.max(limit * 4, 80))
    return rows
      .map(mapRaw)
      .filter((a) => !taken.has(a.id) && !a.isExactDuplicate && a.qualityStatus !== 'FAILED')
      .slice(0, limit)
  }

  async getMembershipByArticle(articleId: string): Promise<ClusterMembershipRecord | null> {
    const rows = await this.db()
      .select()
      .from(clusterMemberships)
      .where(eq(clusterMemberships.articleId, articleId))
      .limit(1)
    return rows[0] ? mapMembership(rows[0]) : null
  }

  async listMemberships(clusterId: string): Promise<ClusterMembershipRecord[]> {
    const rows = await this.db()
      .select()
      .from(clusterMemberships)
      .where(eq(clusterMemberships.clusterId, clusterId))
    return rows.map(mapMembership)
  }

  async insertMembership(input: {
    clusterId: string
    articleId: string
    sourceId: string
    similarityScore: number
    matchBand: ClusterMembershipRecord['matchBand']
    matchExplanation?: ClusterScoreBreakdown | null
    isCanonical?: boolean
  }): Promise<'inserted' | 'duplicate'> {
    const existing = await this.getMembershipByArticle(input.articleId)
    if (existing) return 'duplicate'
    await this.db().insert(clusterMemberships).values({
      id: newCrawlerId('cm'),
      clusterId: input.clusterId,
      articleId: input.articleId,
      sourceId: input.sourceId,
      similarityScore: input.similarityScore,
      matchBand: input.matchBand,
      matchExplanation: (input.matchExplanation as Record<string, number> | null) ?? null,
      isCanonical: input.isCanonical ? 1 : 0,
    })
    return 'inserted'
  }

  async listFailedUrls(limit = 80): Promise<DiscoveredUrlRecord[]> {
    const rows = await this.db()
      .select()
      .from(discoveredArticleUrls)
      .where(eq(discoveredArticleUrls.logicalQueue, 'FAILED_QUEUE'))
      .orderBy(desc(discoveredArticleUrls.updatedAt))
      .limit(limit)
    return rows.map(mapUrl)
  }

  async touchCluster(id: string, representativeArticleId?: string): Promise<void> {
    await this.db()
      .update(newsClusters)
      .set({
        articleCount: sql`${newsClusters.articleCount} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        ...(representativeArticleId ? { representativeArticleId } : {}),
      })
      .where(eq(newsClusters.id, id))
  }

  async updateRawArticle(id: string, patch: Partial<RawArticleRecord>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.clusterId !== undefined) values.clusterId = patch.clusterId
    if (patch.aiEligibility !== undefined) values.aiEligibility = patch.aiEligibility
    if (patch.aiSkipReason !== undefined) values.aiSkipReason = patch.aiSkipReason
    if (patch.clusterStatus !== undefined) values.clusterStatus = patch.clusterStatus
    if (patch.isExactDuplicate !== undefined) values.isExactDuplicate = patch.isExactDuplicate ? 1 : 0
    if (patch.duplicateOfId !== undefined) values.duplicateOfId = patch.duplicateOfId
    if (patch.qualityStatus !== undefined) values.qualityStatus = patch.qualityStatus
    if (patch.mainImageUrl !== undefined) values.mainImageUrl = patch.mainImageUrl
    if (patch.imageUrls !== undefined) values.imageUrls = patch.imageUrls
    if (patch.mediaStatus !== undefined) values.mediaStatus = patch.mediaStatus
    if (patch.mediaExtractedAt !== undefined) values.mediaExtractedAt = patch.mediaExtractedAt
    if (patch.primaryImageMethod !== undefined) values.primaryImageMethod = patch.primaryImageMethod
    if (patch.imageCandidateCount !== undefined) values.imageCandidateCount = patch.imageCandidateCount
    if (patch.imageRejectedCount !== undefined) values.imageRejectedCount = patch.imageRejectedCount
    if (patch.editorialStatus !== undefined) values.editorialStatus = patch.editorialStatus
    if (patch.editorialNewsId !== undefined) values.editorialNewsId = patch.editorialNewsId
    if (patch.rejectionReason !== undefined) values.rejectionReason = patch.rejectionReason
    if (patch.rejectionNote !== undefined) values.rejectionNote = patch.rejectionNote
    if (patch.rejectedAt !== undefined) values.rejectedAt = patch.rejectedAt
    if (patch.rejectedBy !== undefined) values.rejectedBy = patch.rejectedBy
    await this.db().update(rawArticles).set(values).where(eq(rawArticles.id, id))
  }

  async upsertArticleMedia(input: Omit<ArticleMediaRecord, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
    const id = input.id || newCrawlerId('med')
    await this.db()
      .insert(crawlerArticleMedia)
      .values({
        id,
        articleId: input.articleId,
        mediaType: input.mediaType,
        sourceUrl: input.sourceUrl,
        normalizedUrl: input.normalizedUrl,
        width: input.width,
        height: input.height,
        altText: input.altText,
        caption: input.caption,
        credit: input.credit,
        mimeType: input.mimeType,
        discoveryMethod: input.discoveryMethod,
        score: input.score,
        isPrimary: input.isPrimary ? 1 : 0,
        status: input.status,
        rejectionReason: input.rejectionReason,
        qualityScore: input.qualityScore,
        contentHash: input.contentHash,
        perceptualHash: input.perceptualHash,
        imageSource: input.imageSource ?? null,
        imageConfidence: input.imageConfidence ?? null,
      })
      .onConflictDoUpdate({
        target: [crawlerArticleMedia.articleId, crawlerArticleMedia.normalizedUrl],
        set: {
          sourceUrl: input.sourceUrl,
          width: input.width,
          height: input.height,
          altText: input.altText,
          caption: input.caption,
          credit: input.credit,
          mimeType: input.mimeType,
          discoveryMethod: input.discoveryMethod,
          score: input.score,
          isPrimary: input.isPrimary ? 1 : 0,
          status: input.status,
          rejectionReason: input.rejectionReason,
          qualityScore: input.qualityScore,
          contentHash: input.contentHash,
          perceptualHash: input.perceptualHash,
          imageSource: input.imageSource ?? null,
          imageConfidence: input.imageConfidence ?? null,
        },
      })
  }

  async listArticleMedia(articleId: string): Promise<ArticleMediaRecord[]> {
    const rows = await this.db()
      .select()
      .from(crawlerArticleMedia)
      .where(eq(crawlerArticleMedia.articleId, articleId))
    return rows.map(mapMedia).sort((a, b) => b.score - a.score)
  }

  async listPendingMediaArticles(limit: number): Promise<RawArticleRecord[]> {
    const rows = await this.db()
      .select()
      .from(rawArticles)
      .where(eq(rawArticles.mediaStatus, 'PENDING'))
      .orderBy(desc(rawArticles.fetchedAt))
      .limit(limit)
    return rows.map(mapRaw)
  }

  async listRecentExtractedMediaArticles(limit: number): Promise<RawArticleRecord[]> {
    const rows = await this.db()
      .select()
      .from(rawArticles)
      .where(eq(rawArticles.mediaStatus, 'EXTRACTED'))
      .orderBy(desc(rawArticles.fetchedAt))
      .limit(limit)
    return rows.map(mapRaw)
  }

  async listRawArticlesPage(query: RawArticleListQuery): Promise<RawArticleListResult> {
    const pageSize = clampPageSize(query.pageSize)
    const filters = this.rawArticleFilters(query)
    const order = this.rawArticleOrder(query)

    const countRows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(rawArticles)
      .where(filters)
    const total = countRows[0]?.n ?? 0

    const summaryRows = await this.db()
      .select({
        sources: sql<number>`count(distinct ${rawArticles.sourceId})::int`,
        lastHour: sql<number>`count(*) filter (where ${rawArticles.fetchedAt} >= now() - interval '1 hour')::int`,
        withImage: sql<number>`count(*) filter (where coalesce(${rawArticles.mainImageUrl}, '') <> '')::int`,
        duplicates: sql<number>`count(*) filter (where ${rawArticles.isExactDuplicate} = 1)::int`,
      })
      .from(rawArticles)
      .where(filters)
    const summaryAgg = summaryRows[0]

    const sourceRows = await this.db()
      .select({
        sourceId: rawArticles.sourceId,
        sourceName: newsSources.name,
        countryCode: newsSources.countryCode,
        city: newsSources.city,
        articleCount: sql<number>`count(*)::int`,
        latestFetchedAt: sql<Date | null>`max(${rawArticles.fetchedAt})`,
        withImage: sql<number>`count(*) filter (where coalesce(${rawArticles.mainImageUrl}, '') <> '')::int`,
        duplicates: sql<number>`count(*) filter (where ${rawArticles.isExactDuplicate} = 1)::int`,
      })
      .from(rawArticles)
      .innerJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .where(this.rawArticleFilters({ ...query, sourceId: null }))
      .groupBy(rawArticles.sourceId, newsSources.name, newsSources.countryCode, newsSources.city)
      .orderBy(sql`max(${rawArticles.fetchedAt}) desc nulls last`)

    const sources: RawArticleSourceFacet[] = sourceRows.map((row) => ({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      countryCode: row.countryCode,
      city: row.city,
      articleCount: row.articleCount,
      latestFetchedAt: row.latestFetchedAt,
      withImage: row.withImage,
      duplicates: row.duplicates,
    }))

    const summary = {
      total,
      sourceCount: summaryAgg?.sources ?? sources.length,
      lastHour: summaryAgg?.lastHour ?? 0,
      withImage: summaryAgg?.withImage ?? 0,
      withoutImage: total - (summaryAgg?.withImage ?? 0),
      duplicates: summaryAgg?.duplicates ?? 0,
    }

    if (query.view === 'bySource') {
      const totalPages = Math.max(1, Math.ceil(sources.length / pageSize) || 1)
      const page = clampPage(query.page, totalPages)
      const pageFacets = sources.slice((page - 1) * pageSize, page * pageSize)
      const groups = []
      for (const facet of pageFacets) {
        const rows = await this.db()
          .select({ article: rawArticles, sourceName: newsSources.name })
          .from(rawArticles)
          .innerJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
          .where(and(filters, eq(rawArticles.sourceId, facet.sourceId)))
          .orderBy(order)
          .limit(8)
        groups.push({
          ...facet,
          articles: rows.map((r) => ({ ...mapRaw(r.article), sourceName: r.sourceName })),
        })
      }
      return {
        articles: groups.flatMap((g) => g.articles),
        total,
        page,
        pageSize,
        totalPages,
        summary,
        sources,
        groups,
        queueCounts: queueCountsFromStatuses(await this.countEditorialStatuses()),
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
    const page = clampPage(query.page, totalPages)
    const rows = await this.db()
      .select({ article: rawArticles, sourceName: newsSources.name })
      .from(rawArticles)
      .innerJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .where(filters)
      .orderBy(order)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
    const articles: RawArticleListRow[] = rows.map((r) => ({ ...mapRaw(r.article), sourceName: r.sourceName }))
    const queueCounts = queueCountsFromStatuses(await this.countEditorialStatuses())
    return { articles, total, page, pageSize, totalPages, summary, sources, queueCounts }
  }

  private rawArticleOrder(query: RawArticleListQuery) {
    const asc = query.order === 'asc'
    const column = query.sortBy
    if (column === 'wordCount') {
      return asc ? sql`${rawArticles.wordCount} asc nulls last` : sql`${rawArticles.wordCount} desc nulls last`
    }
    if (column === 'extractionConfidence') {
      return asc
        ? sql`${rawArticles.extractionConfidence} asc nulls last`
        : sql`${rawArticles.extractionConfidence} desc nulls last`
    }
    if (column === 'source') {
      return asc ? sql`${newsSources.name} asc nulls last` : sql`${newsSources.name} desc nulls last`
    }
    if (column === 'editorial') {
      return asc
        ? sql`${rawArticles.editorialStatus} asc nulls last`
        : sql`${rawArticles.editorialStatus} desc nulls last`
    }
    if (column === 'status') {
      const rank = sql`(case when ${rawArticles.isExactDuplicate} = 1 then 2 when ${rawArticles.qualityStatus} = 'FAILED' then 3 when ${rawArticles.qualityStatus} = 'LOW_CONFIDENCE' then 1 else 0 end)`
      return asc ? sql`${rank} asc, ${rawArticles.fetchedAt} desc` : sql`${rank} desc, ${rawArticles.fetchedAt} desc`
    }
    if (column === 'publishedAt' || query.sort === 'published') {
      return asc
        ? sql`coalesce(${rawArticles.publishedAt}, ${rawArticles.fetchedAt}) asc nulls last`
        : sql`coalesce(${rawArticles.publishedAt}, ${rawArticles.fetchedAt}) desc nulls last`
    }
    if (query.sort === 'oldest' || (column === 'fetchedAt' && asc)) {
      return sql`${rawArticles.fetchedAt} asc nulls last`
    }
    return sql`${rawArticles.fetchedAt} desc nulls last`
  }

  private rawArticleFilters(query: RawArticleListQuery) {
    const parts = []
    if (query.sourceId) parts.push(eq(rawArticles.sourceId, query.sourceId))
    if (query.country) parts.push(eq(rawArticles.countryCode, query.country.toUpperCase()))
    if (query.city) parts.push(ilike(rawArticles.city, query.city))
    if (query.qualityStatus) parts.push(eq(rawArticles.qualityStatus, query.qualityStatus))
    if (query.editorialStatus) parts.push(eq(rawArticles.editorialStatus, query.editorialStatus))
    else {
      const queue = query.queue || 'active'
      if (queue === 'published') parts.push(eq(rawArticles.editorialStatus, 'PUBLISHED'))
      else if (queue === 'rejected') parts.push(eq(rawArticles.editorialStatus, 'REJECTED'))
      else if (queue === 'archived') parts.push(eq(rawArticles.editorialStatus, 'ARCHIVED'))
      else if (queue === 'all') parts.push(sql`${rawArticles.editorialStatus} <> 'DELETED'`)
      else parts.push(inArray(rawArticles.editorialStatus, ACTIVE_EDITORIAL_STATUSES))
    }
    if (query.hasImage === true) parts.push(sql`coalesce(${rawArticles.mainImageUrl}, '') <> ''`)
    if (query.hasImage === false) parts.push(sql`coalesce(${rawArticles.mainImageUrl}, '') = ''`)
    if (query.status === 'duplicate') parts.push(eq(rawArticles.isExactDuplicate, 1))
    if (query.status === 'extracted') {
      parts.push(eq(rawArticles.isExactDuplicate, 0))
      parts.push(sql`${rawArticles.qualityStatus} <> 'FAILED'`)
    }
    if (query.status === 'failed') parts.push(eq(rawArticles.qualityStatus, 'FAILED'))
    if (query.dateFrom) parts.push(sql`coalesce(${rawArticles.publishedAt}, ${rawArticles.fetchedAt}) >= ${query.dateFrom}`)
    if (query.dateTo) parts.push(sql`coalesce(${rawArticles.publishedAt}, ${rawArticles.fetchedAt}) <= ${query.dateTo}`)
    if (query.search?.trim()) {
      const term = `%${query.search.trim().replace(/[%_]/g, '\\$&')}%`
      parts.push(ilike(rawArticles.title, term))
    }
    return parts.length ? and(...parts) : sql`true`
  }

  async listRawArticleIds(query: RawArticleListQuery, cap: number): Promise<{ ids: string[]; total: number }> {
    const filters = this.rawArticleFilters(query)
    const countRows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(rawArticles)
      .where(filters)
    const rows = await this.db()
      .select({ id: rawArticles.id })
      .from(rawArticles)
      .where(filters)
      .orderBy(desc(rawArticles.fetchedAt))
      .limit(Math.max(0, cap))
    return { total: countRows[0]?.n ?? 0, ids: rows.map((r) => r.id) }
  }

  async deleteRawArticle(id: string): Promise<void> {
    await this.db().delete(rawArticles).where(eq(rawArticles.id, id))
  }

  async insertEditorialAudit(row: CrawlerEditorialAuditRecord): Promise<void> {
    await this.db().insert(crawlerEditorialAudit).values({
      id: row.id,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      affectedCount: row.affectedCount,
      skippedCount: row.skippedCount,
      failedCount: row.failedCount,
      reason: row.reason,
      note: row.note,
      previousState: row.previousState,
      newState: row.newState,
      editorialPriority: row.editorialPriority,
      selectionMode: row.selectionMode,
      createdAt: row.createdAt,
    })
  }

  async listEditorialAudits(limit = 50): Promise<CrawlerEditorialAuditRecord[]> {
    const rows = await this.db()
      .select()
      .from(crawlerEditorialAudit)
      .orderBy(desc(crawlerEditorialAudit.createdAt))
      .limit(limit)
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorEmail: row.actorEmail ?? null,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType as CrawlerEditorialAuditRecord['entityType'],
      entityId: row.entityId ?? null,
      affectedCount: row.affectedCount,
      skippedCount: row.skippedCount,
      failedCount: row.failedCount,
      reason: row.reason ?? null,
      note: row.note ?? null,
      previousState: row.previousState ?? null,
      newState: row.newState ?? null,
      editorialPriority: (row.editorialPriority as CrawlerEditorialAuditRecord['editorialPriority']) ?? null,
      selectionMode: row.selectionMode ?? null,
      createdAt: row.createdAt,
    }))
  }

  async countEditorialStatuses(): Promise<Record<string, number>> {
    const rows = await this.db()
      .select({
        status: rawArticles.editorialStatus,
        n: sql<number>`count(*)::int`,
      })
      .from(rawArticles)
      .groupBy(rawArticles.editorialStatus)
    const out: Record<string, number> = {}
    for (const row of rows) out[row.status] = row.n
    return out
  }

  async countClusterEditorialDecisions(): Promise<Record<string, number>> {
    const rows = await this.db()
      .select({
        decision: newsClusters.editorialDecision,
        n: sql<number>`count(*)::int`,
      })
      .from(newsClusters)
      .groupBy(newsClusters.editorialDecision)
    const out: Record<string, number> = {}
    for (const row of rows) out[row.decision] = row.n
    return out
  }

  async clusterHasEligible(clusterId: string): Promise<boolean> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(rawArticles)
      .where(and(eq(rawArticles.clusterId, clusterId), eq(rawArticles.aiEligibility, 'ELIGIBLE')))
    return (rows[0]?.n ?? 0) > 0
  }

  async hasAiCache(contentHash: string, promptVersion: string, model: string): Promise<boolean> {
    const rows = await this.db()
      .select({ id: aiProcessingCache.id })
      .from(aiProcessingCache)
      .where(
        and(
          eq(aiProcessingCache.contentHash, contentHash),
          eq(aiProcessingCache.promptVersion, promptVersion),
          eq(aiProcessingCache.model, model)
        )
      )
      .limit(1)
    return Boolean(rows[0])
  }

  async incrementMetric(metric: CrawlerMetricName, amount = 1, now = new Date()): Promise<void> {
    const day = dayStamp(now)
    await this.db()
      .insert(crawlerMetricsDaily)
      .values({ day, metric, value: amount, updatedAt: now })
      .onConflictDoUpdate({
        target: [crawlerMetricsDaily.day, crawlerMetricsDaily.metric],
        set: {
          value: sql`${crawlerMetricsDaily.value} + ${amount}`,
          updatedAt: now,
        },
      })
  }

  async getTodayMetrics(now = new Date()): Promise<Record<string, number>> {
    const day = dayStamp(now)
    const rows = await this.db()
      .select()
      .from(crawlerMetricsDaily)
      .where(eq(crawlerMetricsDaily.day, day))
    const out: Record<string, number> = {}
    for (const row of rows) out[row.metric] = row.value
    return out
  }

  async countActiveSources(): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(newsSources)
      .where(eq(newsSources.status, 'ACTIVE'))
    return rows[0]?.n ?? 0
  }

  async countFailedSources(): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)::int` })
      .from(newsSources)
      .where(or(eq(newsSources.status, 'DEGRADED'), sql`${newsSources.consecutiveFailures} >= 3`))
    return rows[0]?.n ?? 0
  }
}
