import { crawlerTickLimits, isGlobalCrawlerEnabled } from '../enabled'
import { discoverSource } from '../discovery/run'
import { extractArticleWithFallback } from '../extract/pipeline'
import { fetchRenderedHtml } from '../extract/browser'
import { fetchDocument, type FetchImpl } from '../http/fetchDocument'
import { canFetchUrl } from '../http/robots'
import { computeNextDiscoveryAt, shouldRetryStatus } from '../http/politeness'
import { evaluateExactDuplicate, hashesForArticle } from '../duplicate/engine'
import { simhashOf } from '../duplicate/hash'
import { evaluateAiCandidate } from '../gate/aiCandidate'
import { dispatchCrawlerArticleToNewsroom } from '../dispatch'
import { clusterTopicFromTitle, findCheapClusterMatch } from '../cluster/cheap'
import { logCrawler } from '../log'
import { hostnameOf, normalizeArticleUrl, urlHashFor } from '../url/normalize'
import type { HostLookup } from '../url/ssrf'
import { DrizzleCrawlerStore, canUseDrizzleCrawlerStore } from '../store/drizzle'
import type { CrawlerStore } from '../store/types'
import type { CrawlerLogicalQueue } from '../types'

export interface CrawlerTickResult {
  enabled: boolean
  skipped?: boolean
  reason?: string
  sourcesChecked: number
  urlsInserted: number
  articlesFetched: number
  extractionSuccess: number
  duplicates: number
  aiCandidates: number
  aiAvoided: number
  aiRequests: number
}

export async function runCrawlerTick(opts?: {
  store?: CrawlerStore
  fetchImpl?: FetchImpl
  lookup?: HostLookup
  now?: Date
  enabled?: boolean
}): Promise<CrawlerTickResult> {
  const enabled = opts?.enabled ?? isGlobalCrawlerEnabled()
  if (!enabled) {
    return emptyTick({ enabled: false, skipped: true, reason: 'GLOBAL_CRAWLER_ENABLED=false' })
  }

  let store = opts?.store
  if (!store) {
    if (!canUseDrizzleCrawlerStore()) {
      return emptyTick({ enabled: true, skipped: true, reason: 'DATABASE_URL missing' })
    }
    store = new DrizzleCrawlerStore()
  }

  const now = opts?.now ?? new Date()
  const fetchImpl = opts?.fetchImpl
  const lookup = opts?.lookup
  const limits = crawlerTickLimits()
  const sources = await store.listDueSources(now, limits.maxSourcesPerTick)
  let urlsInserted = 0
  let articlesFetched = 0
  let extractionSuccess = 0
  let duplicates = 0
  let aiCandidates = 0
  let aiAvoided = 0

  for (const source of sources) {
    await store.incrementMetric('sources_checked', 1, now)
    const started = Date.now()
    try {
      const result = await discoverSource({
        source,
        store,
        fetchImpl,
        lookup,
      })
      urlsInserted += result.inserted
      const failures = result.errorCode && result.discovered === 0 ? source.consecutiveFailures + 1 : 0
      const next = computeNextDiscoveryAt(
        source.crawlIntervalSeconds,
        failures,
        result.inserted,
        now
      )
      const duration = Date.now() - started
      await store.updateSource(source.id, {
        lastDiscoveryAt: now,
        nextDiscoveryAt: next,
        lastSuccessfulDiscoveryAt: result.errorCode && !result.discovered ? source.lastSuccessfulDiscoveryAt : now,
        consecutiveFailures: failures,
        averageResponseMs: blend(source.averageResponseMs, duration),
        articlesDiscovered: source.articlesDiscovered + result.inserted,
        status: failures >= 5 ? 'DEGRADED' : source.status,
      })
      if (failures >= 5) await store.incrementMetric('failed_sources', 1, now)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'discovery_failed'
      logCrawler({ sourceId: source.id, stage: 'discovery', errorCode: message })
      await store.updateSource(source.id, {
        lastDiscoveryAt: now,
        nextDiscoveryAt: computeNextDiscoveryAt(source.crawlIntervalSeconds, source.consecutiveFailures + 1, 0, now),
        consecutiveFailures: source.consecutiveFailures + 1,
      })
    }
  }

  const pending = await store.listPendingFetch(limits.maxFetchPerTick)
  for (const item of pending) {
    const source = await store.getSource(item.sourceId)
    if (!source || source.status === 'DISABLED') {
      await store.updateDiscoveredUrl(item.id, { status: 'FAILED', logicalQueue: 'FAILED_QUEUE', failureReason: 'source_disabled' })
      continue
    }

    await store.updateDiscoveredUrl(item.id, {
      status: 'FETCHING',
      lastFetchAttempt: now,
      fetchAttempts: item.fetchAttempts + 1,
    })

    const robotsOk = await canFetchUrl({
      url: item.normalizedUrl,
      fetchImpl,
      lookup,
      policy: source.robotsPolicy,
      sourceId: source.id,
    })
    if (!robotsOk) {
      await store.updateDiscoveredUrl(item.id, {
        status: 'FAILED',
        logicalQueue: 'FAILED_QUEUE',
        failureReason: 'robots_disallow',
      })
      continue
    }

    const fetched = await fetchDocument({
      url: item.normalizedUrl,
      fetchImpl,
      lookup,
      sourceId: source.id,
      conditional: { etag: item.etag, lastModified: item.lastModified },
    })
    await store.incrementMetric('http_requests', 1, now)
    await store.incrementMetric('fetch_duration_ms_sum', fetched.durationMs, now)
    await store.incrementMetric('fetch_duration_count', 1, now)

    if (fetched.errorCode === 'SSRF_BLOCKED') {
      await store.updateDiscoveredUrl(item.id, {
        status: 'FAILED_SSRF',
        logicalQueue: 'FAILED_QUEUE',
        failureReason: 'ssrf',
      })
      continue
    }

    if (fetched.status === 404 || fetched.status === 410) {
      await store.updateDiscoveredUrl(item.id, {
        status: 'FAILED_404',
        logicalQueue: 'FAILED_QUEUE',
        failureReason: `http_${fetched.status}`,
      })
      continue
    }

    if (!fetched.ok && !fetched.notModified) {
      const retry = shouldRetryStatus(fetched.status)
      await store.updateDiscoveredUrl(item.id, {
        status: retry && item.fetchAttempts + 1 < 4 ? 'PENDING_FETCH' : 'FAILED',
        logicalQueue: retry ? 'ARTICLE_FETCH_QUEUE' : 'FAILED_QUEUE',
        failureReason: fetched.errorCode || `http_${fetched.status}`,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
      })
      continue
    }

    if (fetched.notModified) {
      await store.updateDiscoveredUrl(item.id, { status: 'FETCHED', logicalQueue: 'EXTRACTION_QUEUE' })
      continue
    }

    articlesFetched += 1
    await store.incrementMetric('articles_fetched', 1, now)

    let html = fetched.body
    let extracted = await extractArticleWithFallback(html, fetched.finalUrl, source.language)
    const wantsBrowser =
      source.articleFetchMode === 'BROWSER' ||
      (source.articleFetchMode === 'AUTO' &&
        (source.requiresJavascript || extracted.articleBodyText.length < 220))
    if (wantsBrowser) {
      const rendered = await fetchRenderedHtml({ url: fetched.finalUrl, sourceId: source.id })
      if (rendered.usedBrowser && rendered.html) {
        await store.incrementMetric('browser_requests', 1, now)
        html = rendered.html
        extracted = await extractArticleWithFallback(html, fetched.finalUrl, source.language)
      }
    }

    const hashes = hashesForArticle(extracted.title, extracted.articleBodyText)
    const simhash = extracted.articleBodyText ? simhashOf(extracted.articleBodyText) : null
    const canonical = extracted.canonicalUrl || normalizeArticleUrl(fetched.finalUrl)
    const near = await store.recentRawForNearDup(source.countryCode)
    const existingNorm = await store.getDiscoveredByHash(item.urlHash)
    const dup = evaluateExactDuplicate({
      canonicalUrl: canonical,
      bodyText: extracted.articleBodyText,
      title: extracted.title,
      simhash,
      existingByNormalizedUrl: existingNorm && existingNorm.id !== item.id ? existingNorm.id : null,
      existingByCanonicalUrl: canonical ? (await store.findRawByCanonicalUrl(canonical))?.id ?? null : null,
      existingByContentHash: hashes.contentHash
        ? (await store.findRawByContentHash(hashes.contentHash))?.id ?? null
        : null,
      existingByTitleHash: hashes.titleHash ? (await store.findRawByTitleHash(hashes.titleHash))?.id ?? null : null,
      nearCandidates: near,
    })

    const success = Boolean(extracted.title) && extracted.articleBodyText.length >= 80
    if (success) {
      extractionSuccess += 1
      await store.incrementMetric('extraction_success', 1, now)
    } else {
      await store.incrementMetric('extraction_fail', 1, now)
    }

    const raw = await store.insertRawArticle({
      sourceId: source.id,
      discoveredUrlId: item.id,
      originalUrl: item.url,
      normalizedUrl: item.normalizedUrl,
      canonicalUrl: canonical,
      urlHash: item.urlHash || urlHashFor(item.normalizedUrl),
      title: extracted.title,
      description: extracted.description,
      articleBodyText: extracted.articleBodyText || null,
      articleBodyHtml: extracted.articleBodyHtml || null,
      author: extracted.author,
      publishedAt: extracted.publishedAt || item.publishedAtHint,
      modifiedAt: extracted.modifiedAt,
      language: extracted.language,
      countryCode: source.countryCode,
      region: source.region,
      city: source.city,
      district: source.district,
      mainImageUrl: extracted.mainImageUrl,
      imageUrls: extracted.imageUrls,
      videoUrls: extracted.videoUrls,
      wordCount: extracted.wordCount,
      charCount: extracted.charCount,
      paragraphCount: extracted.paragraphCount,
      contentHash: hashes.contentHash,
      titleHash: hashes.titleHash,
      simhash,
      extractionMethod: extracted.extractionMethod,
      extractionConfidence: extracted.extractionConfidence,
      httpStatus: fetched.status,
      fetchDurationMs: fetched.durationMs,
      fetchedAt: now,
      isExactDuplicate: Boolean(dup),
      duplicateOfId: dup?.existingId ?? null,
    })

    if (dup) {
      duplicates += 1
      await store.incrementMetric('duplicates_removed', 1, now)
      await store.updateDiscoveredUrl(item.id, {
        status: 'DUPLICATE',
        canonicalUrl: canonical,
        logicalQueue: 'FAILED_QUEUE',
        failureReason: dup.reason,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
      })
    } else {
      await store.updateDiscoveredUrl(item.id, {
        status: 'EXTRACTED',
        canonicalUrl: canonical,
        logicalQueue: 'CLUSTER_QUEUE',
        failureReason: success ? null : 'thin_extraction',
        etag: fetched.etag,
        lastModified: fetched.lastModified,
      })
    }

    const dispatch = dispatchCrawlerArticleToNewsroom({ articleId: raw.id, sourceId: source.id })
    if (dispatch.dispatched) {
      await store.incrementMetric('ai_requests', 1, now)
    }

    const since = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    const clusters = await store.recentClusters(source.countryCode, since)
    const match = findCheapClusterMatch(raw, clusters, now)
    let clusterId = match?.id ?? null
    if (!dup && success) {
      if (match) {
        await store.touchCluster(match.id, raw.id)
        clusterId = match.id
      } else {
        const created = await store.insertCluster({
          representativeArticleId: raw.id,
          normalizedTopic: clusterTopicFromTitle(raw.title),
          countryCode: source.countryCode,
          city: source.city,
        })
        clusterId = created.id
      }
      await store.updateRawArticle(raw.id, { clusterId, clusterStatus: 'CLUSTERED' })
    } else {
      await store.updateRawArticle(raw.id, { clusterStatus: 'SKIPPED' })
    }

    const cacheHit = hashes.contentHash
      ? await store.hasAiCache(hashes.contentHash, 'phase1-placeholder', 'none')
      : false
    const clusterHasBetter = clusterId ? await store.clusterHasEligible(clusterId) : false
    const gate = evaluateAiCandidate({
      source,
      article: { ...raw, isExactDuplicate: Boolean(dup) },
      clusterHasBetterEligible: clusterHasBetter,
      cacheHit,
      now,
    })
    await store.updateRawArticle(raw.id, {
      aiEligibility: 'SKIPPED',
      aiSkipReason: dispatch.reason.slice(0, 80),
    })
    aiAvoided += 1
    await store.incrementMetric('ai_requests_avoided', 1, now)
    void gate

    await store.updateSource(source.id, {
      articlesFetched: source.articlesFetched + 1,
      extractionSuccessRate: blendRate(source.extractionSuccessRate, success),
    })

    logCrawler({
      sourceId: source.id,
      url: hostnameOf(item.normalizedUrl) ? item.normalizedUrl : undefined,
      stage: 'extract',
      durationMs: fetched.durationMs,
      httpStatus: fetched.status,
      extractionMethod: extracted.extractionMethod,
      confidence: extracted.extractionConfidence,
    })
  }

  return {
    enabled: true,
    sourcesChecked: sources.length,
    urlsInserted,
    articlesFetched,
    extractionSuccess,
    duplicates,
    aiCandidates,
    aiAvoided,
    aiRequests: 0,
  }
}

function emptyTick(extra: Partial<CrawlerTickResult> & { enabled: boolean }): CrawlerTickResult {
  return {
    sourcesChecked: 0,
    urlsInserted: 0,
    articlesFetched: 0,
    extractionSuccess: 0,
    duplicates: 0,
    aiCandidates: 0,
    aiAvoided: 0,
    aiRequests: 0,
    ...extra,
  }
}

function blend(prev: number | null, sample: number): number {
  if (prev == null || prev <= 0) return sample
  return Math.round(prev * 0.7 + sample * 0.3)
}

function blendRate(prev: number | null, success: boolean): number {
  const sample = success ? 1 : 0
  if (prev == null) return sample
  return Number((prev * 0.8 + sample * 0.2).toFixed(4))
}

export function queueNameForStatus(status: string): CrawlerLogicalQueue {
  if (status === 'PENDING_FETCH' || status === 'FETCHING') return 'ARTICLE_FETCH_QUEUE'
  if (status === 'FETCHED') return 'EXTRACTION_QUEUE'
  if (status === 'EXTRACTED' || status === 'CLUSTER_PENDING') return 'CLUSTER_QUEUE'
  if (status === 'AI_ELIGIBLE' || status === 'AI_SKIPPED') return 'AI_CANDIDATE_QUEUE'
  return 'FAILED_QUEUE'
}
