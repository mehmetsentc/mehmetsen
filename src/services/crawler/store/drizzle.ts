import { and, eq, lte, sql, desc, gte, or } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  aiProcessingCache,
  crawlerMetricsDaily,
  discoveredArticleUrls,
  newsClusters,
  newsSources,
  rawArticles,
} from '@/db/schema/crawler'
import type {
  CrawlerLogicalQueue,
  CrawlerMetricName,
  CrawlerUrlStatus,
  DiscoveredUrlRecord,
  NewsClusterRecord,
  NewsSourceRecord,
  RawArticleRecord,
} from '../types'
import type {
  CrawlerStore,
  InsertDiscoveredUrlInput,
  InsertRawArticleInput,
  InsertSourceInput,
} from './types'
import { newCrawlerId } from './types'

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
  }
}

function mapCluster(row: typeof newsClusters.$inferSelect): NewsClusterRecord {
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
    await this.db().update(newsSources).set(values).where(eq(newsSources.id, id))
  }

  async listDueSources(now: Date, limit: number): Promise<NewsSourceRecord[]> {
    const rows = await this.db()
      .select()
      .from(newsSources)
      .where(
        and(
          eq(newsSources.status, 'ACTIVE'),
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
          eq(newsSources.status, 'ACTIVE'),
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

  async insertCluster(input: {
    representativeArticleId: string
    normalizedTopic: string
    countryCode: string | null
    city: string | null
  }): Promise<NewsClusterRecord> {
    const id = newCrawlerId('cl')
    const now = new Date()
    await this.db().insert(newsClusters).values({
      id,
      representativeArticleId: input.representativeArticleId,
      normalizedTopic: input.normalizedTopic,
      countryCode: input.countryCode,
      city: input.city,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    const rows = await this.db().select().from(newsClusters).where(eq(newsClusters.id, id)).limit(1)
    return mapCluster(rows[0])
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
    await this.db().update(rawArticles).set(values).where(eq(rawArticles.id, id))
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
