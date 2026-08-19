import type {
  ArticleMediaRecord,
  ClusterMembershipRecord,
  ClusterScoreBreakdown,
  CrawlerLogicalQueue,
  CrawlerMetricName,
  CrawlerUrlStatus,
  CrawlerEditorialAuditRecord,
  DiscoveredUrlRecord,
  NewsClusterRecord,
  NewsSourceRecord,
  RawArticleRecord,
} from '../types'
import type {
  CrawlerStore,
  InsertClusterInput,
  InsertDiscoveredUrlInput,
  InsertRawArticleInput,
  InsertSourceInput,
  RawArticleListQuery,
  RawArticleListResult,
} from './types'
import { newCrawlerId } from './types'
import { clusterDefaults } from '../cluster/defaults'
import { matchesClusterQuery, matchesRawArticleQuery, paginateRawArticles, queueCountsFromStatuses, sortRawArticleRows, type ClusterListQuery } from '../editorial/query'
import { funnelFromClusters, tabCountsFromClusters } from '../editorial/controlPlane'

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

export class MemoryCrawlerStore implements CrawlerStore {
  sources = new Map<string, NewsSourceRecord>()
  urls = new Map<string, DiscoveredUrlRecord>()
  urlsByHash = new Map<string, string>()
  articles = new Map<string, RawArticleRecord>()
  media = new Map<string, ArticleMediaRecord>()
  clusters = new Map<string, NewsClusterRecord>()
  memberships = new Map<string, ClusterMembershipRecord>()
  metrics = new Map<string, number>()
  aiCache = new Set<string>()
  audits: CrawlerEditorialAuditRecord[] = []

  async listSources(): Promise<NewsSourceRecord[]> {
    return [...this.sources.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async getSource(id: string): Promise<NewsSourceRecord | null> {
    return this.sources.get(id) ?? null
  }

  async insertSource(input: InsertSourceInput): Promise<NewsSourceRecord> {
    const now = new Date()
    const row: NewsSourceRecord = {
      id: newCrawlerId('src'),
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
      rssUrls: asStringArray(input.rssUrls),
      sitemapUrls: asStringArray(input.sitemapUrls),
      listingUrls: asStringArray(input.listingUrls),
      crawlIntervalSeconds: input.crawlIntervalSeconds ?? 300,
      articleFetchMode: input.articleFetchMode ?? 'AUTO',
      requiresJavascript: Boolean(input.requiresJavascript),
      robotsPolicy: input.robotsPolicy ?? 'FOLLOW',
      lastDiscoveryAt: null,
      nextDiscoveryAt: now,
      lastSuccessfulDiscoveryAt: null,
      lastFeedEtag: null,
      lastFeedModified: null,
      consecutiveFailures: 0,
      averageResponseMs: null,
      articlesDiscovered: 0,
      articlesFetched: 0,
      extractionSuccessRate: null,
      geographicScope: input.geographicScope ?? 'NATIONAL',
      sourceCategory: input.sourceCategory ?? 'GENERAL',
      crawlPriority: input.crawlPriority ?? 'NORMAL',
      qualityTier: input.qualityTier ?? 'UNTESTED',
      healthScore: input.healthScore ?? 50,
      freshnessHours: input.freshnessHours ?? 48,
      lastPauseReason: null,
      registryKey: input.registryKey ?? null,
      createdAt: now,
      updatedAt: now,
    }
    this.sources.set(row.id, row)
    return row
  }

  async updateSource(id: string, patch: Partial<NewsSourceRecord>): Promise<void> {
    const row = this.sources.get(id)
    if (!row) return
    Object.assign(row, patch, { updatedAt: new Date() })
  }

  async listDueSources(now: Date, limit: number): Promise<NewsSourceRecord[]> {
    return [...this.sources.values()]
      .filter(
        (s) =>
          (s.status === 'ACTIVE' || s.status === 'DEGRADED') &&
          (!s.nextDiscoveryAt || s.nextDiscoveryAt.getTime() <= now.getTime())
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, limit)
  }

  async countDueSources(now: Date): Promise<number> {
    return (await this.listDueSources(now, 10_000)).length
  }

  async insertDiscoveredUrl(input: InsertDiscoveredUrlInput): Promise<'inserted' | 'duplicate'> {
    if (this.urlsByHash.has(input.urlHash)) return 'duplicate'
    const now = new Date()
    const row: DiscoveredUrlRecord = {
      id: newCrawlerId('url'),
      sourceId: input.sourceId,
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      canonicalUrl: null,
      urlHash: input.urlHash,
      discoveredAt: now,
      publishedAtHint: input.publishedAtHint ?? null,
      status: 'PENDING_FETCH',
      fetchAttempts: 0,
      lastFetchAttempt: null,
      failureReason: null,
      etag: null,
      lastModified: null,
      logicalQueue: 'ARTICLE_FETCH_QUEUE',
    }
    this.urls.set(row.id, row)
    this.urlsByHash.set(input.urlHash, row.id)
    return 'inserted'
  }

  async getDiscoveredByHash(urlHash: string): Promise<DiscoveredUrlRecord | null> {
    const id = this.urlsByHash.get(urlHash)
    return id ? this.urls.get(id) ?? null : null
  }

  async listPendingFetch(limit: number): Promise<DiscoveredUrlRecord[]> {
    return [...this.urls.values()]
      .filter((u) => u.status === 'PENDING_FETCH')
      .sort((a, b) => a.discoveredAt.getTime() - b.discoveredAt.getTime())
      .slice(0, limit)
  }

  async updateDiscoveredUrl(id: string, patch: Partial<DiscoveredUrlRecord>): Promise<void> {
    const row = this.urls.get(id)
    if (!row) return
    Object.assign(row, patch)
  }

  async countByStatus(status: CrawlerUrlStatus): Promise<number> {
    return [...this.urls.values()].filter((u) => u.status === status).length
  }

  async countQueue(queue: CrawlerLogicalQueue): Promise<number> {
    return [...this.urls.values()].filter((u) => u.logicalQueue === queue).length
  }

  async insertRawArticle(input: InsertRawArticleInput): Promise<RawArticleRecord> {
    const row: RawArticleRecord = {
      ...input,
      id: newCrawlerId('raw'),
      clusterId: input.clusterId ?? null,
      aiEligibility: input.aiEligibility ?? 'PENDING',
      aiSkipReason: input.aiSkipReason ?? null,
      clusterStatus: input.clusterStatus ?? 'PENDING',
      isExactDuplicate: Boolean(input.isExactDuplicate),
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
      rejectionReason: input.rejectionReason ?? null,
      rejectionNote: input.rejectionNote ?? null,
      rejectedAt: input.rejectedAt ?? null,
      rejectedBy: input.rejectedBy ?? null,
    }
    this.articles.set(row.id, row)
    return row
  }

  async getRawArticle(id: string): Promise<RawArticleRecord | null> {
    return this.articles.get(id) ?? null
  }

  async listRecentArticles(limit = 50): Promise<RawArticleRecord[]> {
    return [...this.articles.values()]
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0))
      .slice(0, limit)
  }

  async findRawByContentHash(hash: string): Promise<RawArticleRecord | null> {
    return [...this.articles.values()].find((a) => a.contentHash === hash) ?? null
  }

  async findRawByTitleHash(hash: string): Promise<RawArticleRecord | null> {
    return [...this.articles.values()].find((a) => a.titleHash === hash) ?? null
  }

  async findRawByCanonicalUrl(url: string): Promise<RawArticleRecord | null> {
    return [...this.articles.values()].find((a) => a.canonicalUrl === url) ?? null
  }

  async recentRawForNearDup(_sourceCountry: string | null, limit = 40): Promise<RawArticleRecord[]> {
    return [...this.articles.values()]
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0))
      .slice(0, limit)
  }

  async recentClusters(countryCode: string | null, since: Date) {
    return [...this.clusters.values()]
      .filter((c) => c.lastSeenAt >= since && (!countryCode || c.countryCode === countryCode))
      .map((c) => {
        const rep = c.representativeArticleId ? this.articles.get(c.representativeArticleId) : null
        return {
          ...c,
          representativeTitle: rep?.title ?? null,
          representativeSimhash: rep?.simhash ?? null,
        }
      })
  }

  async insertCluster(input: InsertClusterInput): Promise<NewsClusterRecord> {
    const now = new Date()
    const row: NewsClusterRecord = {
      id: newCrawlerId('cl'),
      representativeArticleId: input.representativeArticleId,
      normalizedTopic: input.normalizedTopic,
      countryCode: input.countryCode,
      city: input.city,
      category: null,
      articleCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      ...clusterDefaults(now),
      eventKey: input.eventKey ?? null,
      canonicalTitle: input.canonicalTitle ?? null,
      language: input.language ?? null,
      region: input.region ?? null,
      district: input.district ?? null,
      categoryHint: input.categoryHint ?? null,
      signatureTokens: input.signatureTokens ?? [],
    }
    this.clusters.set(row.id, row)
    return row
  }

  async updateCluster(id: string, patch: Partial<NewsClusterRecord>): Promise<void> {
    const row = this.clusters.get(id)
    if (!row) return
    Object.assign(row, patch, { updatedAt: new Date() })
  }

  async getCluster(id: string): Promise<NewsClusterRecord | null> {
    return this.clusters.get(id) ?? null
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
    const filtered = [...this.clusters.values()]
      .filter((c) => {
        if (opts?.since && c.lastSeenAt < opts.since) return false
        if (opts?.countryCode && c.countryCode !== opts.countryCode) return false
        if (opts?.city && (c.city || '').toLowerCase() !== opts.city.toLowerCase()) return false
        if (opts?.eligibility && c.aiEligibility !== opts.eligibility) return false
        if (opts?.editorialDecision && c.editorialDecision !== opts.editorialDecision) return false
        if (opts?.minSources && c.uniqueSourceCount < opts.minSources) return false
        return true
      })
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    return typeof opts?.limit === 'number' ? filtered.slice(0, opts.limit) : filtered
  }

  async listClustersMatching(query: ClusterListQuery): Promise<NewsClusterRecord[]> {
    const sourceIds = query.sourceId
      ? new Set(
          [...this.memberships.values()].filter((m) => m.sourceId === query.sourceId).map((m) => m.clusterId)
        )
      : null
    return [...this.clusters.values()]
      .filter((c) => matchesClusterQuery(c, query))
      .filter((c) => (sourceIds ? sourceIds.has(c.id) : true))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  }

  async listClustersPage(query: ClusterListQuery) {
    const matched = await this.listClustersMatching(query)
    const pageSize = query.pageSize === 50 || query.pageSize === 100 ? query.pageSize : 25
    const total = matched.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
    const page = Math.min(Math.max(query.page || 1, 1), totalPages)
    const start = (page - 1) * pageSize
    return {
      clusters: matched.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  async listClusterIdsMatching(query: ClusterListQuery, cap: number): Promise<{ ids: string[]; total: number }> {
    const matched = await this.listClustersMatching(query)
    if (matched.length > cap) return { ids: [], total: matched.length }
    return { total: matched.length, ids: matched.slice(0, cap).map((c) => c.id) }
  }

  async countClusterFunnel(now = new Date()) {
    return funnelFromClusters([...this.clusters.values()], now)
  }

  async countClusterTabs(query: ClusterListQuery) {
    const base = await this.listClustersMatching({ ...query, tab: '' })
    return tabCountsFromClusters(base)
  }

  async countRawArticles(opts?: { excludeDeleted?: boolean }): Promise<number> {
    return [...this.articles.values()].filter((a) => (opts?.excludeDeleted === false ? true : a.editorialStatus !== 'DELETED'))
      .length
  }

  async listPendingClusterArticles(limit: number): Promise<RawArticleRecord[]> {
    const taken = new Set([...this.memberships.values()].map((m) => m.articleId))
    return [...this.articles.values()]
      .filter((a) => !taken.has(a.id) && !a.isExactDuplicate && a.qualityStatus !== 'FAILED')
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0))
      .slice(0, limit)
  }

  async getMembershipByArticle(articleId: string): Promise<ClusterMembershipRecord | null> {
    return [...this.memberships.values()].find((m) => m.articleId === articleId) ?? null
  }

  async listMemberships(clusterId: string): Promise<ClusterMembershipRecord[]> {
    return [...this.memberships.values()].filter((m) => m.clusterId === clusterId)
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
    if ([...this.memberships.values()].some((m) => m.articleId === input.articleId)) return 'duplicate'
    const row: ClusterMembershipRecord = {
      id: newCrawlerId('cm'),
      clusterId: input.clusterId,
      articleId: input.articleId,
      sourceId: input.sourceId,
      similarityScore: input.similarityScore,
      matchBand: input.matchBand,
      matchExplanation: input.matchExplanation ?? null,
      isCanonical: Boolean(input.isCanonical),
      createdAt: new Date(),
    }
    this.memberships.set(row.id, row)
    return 'inserted'
  }

  async listFailedUrls(limit = 80): Promise<DiscoveredUrlRecord[]> {
    return [...this.urls.values()]
      .filter((u) => u.logicalQueue === 'FAILED_QUEUE')
      .slice(0, limit)
  }

  async touchCluster(id: string, representativeArticleId?: string): Promise<void> {
    const row = this.clusters.get(id)
    if (!row) return
    row.articleCount += 1
    row.lastSeenAt = new Date()
    if (representativeArticleId) row.representativeArticleId = representativeArticleId
  }

  async updateRawArticle(id: string, patch: Partial<RawArticleRecord>): Promise<void> {
    const row = this.articles.get(id)
    if (!row) return
    Object.assign(row, patch)
  }

  async listRawArticlesPage(query: RawArticleListQuery): Promise<RawArticleListResult> {
    const sources = new Map<string, string>()
    for (const s of this.sources.values()) sources.set(s.id, s.name)
    const filtered = [...this.articles.values()].filter((a) => matchesRawArticleQuery(a, query))
    const rows = filtered.map((a) => ({ ...a, sourceName: sources.get(a.sourceId) || a.sourceId }))
    const sorted = sortRawArticleRows(rows, query)
    const page = paginateRawArticles(sorted, query)
    page.queueCounts = queueCountsFromStatuses(await this.countEditorialStatuses())
    return page
  }

  async listRawArticleIds(query: RawArticleListQuery, cap: number): Promise<{ ids: string[]; total: number }> {
    const filtered = [...this.articles.values()].filter((a) => matchesRawArticleQuery(a, query))
    return { total: filtered.length, ids: filtered.slice(0, cap).map((a) => a.id) }
  }

  async deleteRawArticle(id: string): Promise<void> {
    this.articles.delete(id)
  }

  async insertEditorialAudit(row: CrawlerEditorialAuditRecord): Promise<void> {
    this.audits.push(row)
  }

  async listEditorialAudits(limit = 50): Promise<CrawlerEditorialAuditRecord[]> {
    return [...this.audits].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)
  }

  async countEditorialStatuses(): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    for (const a of this.articles.values()) {
      out[a.editorialStatus] = (out[a.editorialStatus] || 0) + 1
    }
    return out
  }

  async countClusterEditorialDecisions(): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    for (const c of this.clusters.values()) {
      out[c.editorialDecision] = (out[c.editorialDecision] || 0) + 1
    }
    return out
  }

  async clusterHasEligible(clusterId: string): Promise<boolean> {
    return [...this.articles.values()].some(
      (a) => a.clusterId === clusterId && a.aiEligibility === 'ELIGIBLE'
    )
  }

  async hasAiCache(contentHash: string, promptVersion: string, model: string): Promise<boolean> {
    return this.aiCache.has(`${contentHash}:${promptVersion}:${model}`)
  }

  async incrementMetric(metric: CrawlerMetricName, amount = 1, now = new Date()): Promise<void> {
    const key = `${dayKey(now)}:${metric}`
    this.metrics.set(key, (this.metrics.get(key) || 0) + amount)
  }

  async getTodayMetrics(now = new Date()): Promise<Record<string, number>> {
    const prefix = `${dayKey(now)}:`
    const out: Record<string, number> = {}
    for (const [key, value] of this.metrics) {
      if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value
    }
    return out
  }

  async countActiveSources(): Promise<number> {
    return [...this.sources.values()].filter((s) => s.status === 'ACTIVE').length
  }

  async countFailedSources(): Promise<number> {
    return [...this.sources.values()].filter((s) => s.status === 'DEGRADED' || s.consecutiveFailures >= 3).length
  }

  async upsertArticleMedia(input: Omit<ArticleMediaRecord, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
    const existing = [...this.media.values()].find(
      (m) => m.articleId === input.articleId && m.normalizedUrl === input.normalizedUrl
    )
    const row: ArticleMediaRecord = {
      ...input,
      id: input.id || existing?.id || newCrawlerId('med'),
      createdAt: existing?.createdAt || new Date(),
    }
    this.media.set(row.id, row)
  }

  async listArticleMedia(articleId: string): Promise<ArticleMediaRecord[]> {
    return [...this.media.values()].filter((m) => m.articleId === articleId).sort((a, b) => b.score - a.score)
  }

  async listPendingMediaArticles(limit: number): Promise<RawArticleRecord[]> {
    return [...this.articles.values()]
      .filter((a) => a.mediaStatus === 'PENDING')
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0))
      .slice(0, limit)
  }

  async listRecentExtractedMediaArticles(limit: number): Promise<RawArticleRecord[]> {
    return [...this.articles.values()]
      .filter((a) => a.mediaStatus === 'EXTRACTED')
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0))
      .slice(0, limit)
  }
}
