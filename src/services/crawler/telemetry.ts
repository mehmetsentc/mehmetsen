import type { CrawlerStore } from './store/types'
import { isGlobalCrawlerEnabled, isNewsCrawlerBrowserEnabled } from './enabled'
import { isCrawlerAiDispatchEnabled } from './dispatch'

export async function crawlerDashboardSnapshot(store: CrawlerStore, now = new Date()) {
  const metrics = await store.getTodayMetrics(now)
  const http = metrics.http_requests || 0
  const browser = metrics.browser_requests || 0
  const durationSum = metrics.fetch_duration_ms_sum || 0
  const durationCount = metrics.fetch_duration_count || 0
  const extractionSuccess = metrics.extraction_success || 0
  const extractionFail = metrics.extraction_fail || 0
  const sources = await store.listSources()
  const windows = {
    '15m': await storeWindow(store, now, 15 * 60 * 1000),
    '1h': await storeWindow(store, now, 60 * 60 * 1000),
    '6h': await storeWindow(store, now, 6 * 60 * 60 * 1000),
    '24h': await storeWindow(store, now, 24 * 60 * 60 * 1000),
  }
  return {
    enabled: isGlobalCrawlerEnabled(),
    aiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    browserEnabled: isNewsCrawlerBrowserEnabled(),
    activeSources: sources.filter((s) => s.status === 'ACTIVE').length,
    degradedSources: sources.filter((s) => s.status === 'DEGRADED').length,
    pausedSources: sources.filter((s) => s.status === 'PAUSED').length,
    sourcesDue: await store.countDueSources(now),
    sourcesCheckedToday: metrics.sources_checked || 0,
    urlsDiscovered: metrics.urls_discovered || 0,
    newUrls: metrics.urls_new || 0,
    articlesFetched: metrics.articles_fetched || 0,
    extractionSuccess,
    extractionFailed: extractionFail,
    lowConfidence: metrics.low_confidence || 0,
    duplicatesRemoved: metrics.duplicates_removed || 0,
    aiCandidates: metrics.ai_candidates || 0,
    aiRequests: metrics.ai_requests || 0,
    aiRequestsAvoided: metrics.ai_requests_avoided || 0,
    estimatedAiCandidatesPrevented: metrics.ai_requests_avoided || 0,
    aiCostUsd: 0,
    httpRequests: http,
    browserRequests: browser,
    browserHttpRatio: http > 0 ? browser / http : 0,
    averageFetchTimeMs: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    failedSources: await store.countFailedSources(),
    articlesWithPrimaryImage: metrics.articles_with_primary_image || 0,
    articlesWithoutImage: metrics.articles_without_image || 0,
    imageCandidatesFound: metrics.image_candidates_found || 0,
    imageCandidatesRejected: metrics.image_candidates_rejected || 0,
    imageExtractionFailed: metrics.image_extraction_failed || 0,
    primaryImageJsonld: metrics.primary_image_jsonld || 0,
    primaryImageOg: metrics.primary_image_og || 0,
    primaryImageDom: metrics.primary_image_dom || 0,
    windows,
    sources: sources
      .map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        healthScore: s.healthScore,
        qualityTier: s.qualityTier,
        crawlPriority: s.crawlPriority,
        consecutiveFailures: s.consecutiveFailures,
        lastPauseReason: s.lastPauseReason,
      }))
      .sort((a, b) => b.healthScore - a.healthScore),
    queues: {
      discovery: await store.countQueue('DISCOVERY_QUEUE'),
      articleFetch: await store.countQueue('ARTICLE_FETCH_QUEUE'),
      extraction: await store.countQueue('EXTRACTION_QUEUE'),
      cluster: await store.countQueue('CLUSTER_QUEUE'),
      aiCandidate: await store.countQueue('AI_CANDIDATE_QUEUE'),
      failed: await store.countQueue('FAILED_QUEUE'),
    },
    funnel: await clusterFunnel(store, metrics),
    legacyRssIngest: 'ON',
  }
}

async function clusterFunnel(store: CrawlerStore, metrics: Record<string, number>) {
  const clusters = await store.listClusters({ limit: 400 })
  const eligible = clusters.filter((c) => c.aiEligibility === 'ELIGIBLE').length
  const watching = clusters.filter((c) => c.aiEligibility === 'WATCHING').length
  const rejected = clusters.filter((c) => c.aiEligibility === 'REJECTED').length
  const high = clusters.filter((c) => c.aiEligibility === 'HIGH_PRIORITY').length
  const multi = clusters.filter((c) => c.uniqueSourceCount >= 2).length
  const single = clusters.filter((c) => c.uniqueSourceCount <= 1).length
  const raw = metrics.articles_fetched || 0
  const uniqueEvents = clusters.length
  const potentialArticleJobs = raw
  const avoidedDuplicateEventJobs = Math.max(0, raw - uniqueEvents)
  return {
    rawArticles: raw,
    uniqueEvents,
    aiEligibleEvents: eligible + high,
    watching,
    rejected,
    highPriority: high,
    singleSourceClusters: single,
    multiSourceClusters: multi,
    clustersCreated: metrics.clusters_created || uniqueEvents,
    articlesClustered: metrics.articles_clustered || 0,
    borderlineMatches: metrics.borderline_matches || 0,
    potentialArticleLevelAiJobs: potentialArticleJobs,
    uniqueEventCandidates: uniqueEvents,
    aiEligibleEventJobs: eligible + high,
    avoidedDuplicateEventJobs,
    mergeRate: raw > 0 ? Number((1 - uniqueEvents / Math.max(raw, 1)).toFixed(4)) : 0,
    aiCostUsd: 0,
  }
}

async function storeWindow(store: CrawlerStore, now: Date, ms: number) {
  const since = new Date(now.getTime() - ms)
  const articles = (await store.listRecentArticles(200)).filter(
    (a) => a.fetchedAt && a.fetchedAt.getTime() >= since.getTime()
  )
  return {
    articlesFetched: articles.length,
    successfulExtraction: articles.filter((a) => a.qualityStatus === 'EXTRACTED').length,
    lowConfidence: articles.filter((a) => a.qualityStatus === 'LOW_CONFIDENCE').length,
    duplicates: articles.filter((a) => a.isExactDuplicate).length,
  }
}

