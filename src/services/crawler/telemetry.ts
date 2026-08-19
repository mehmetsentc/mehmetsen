import type { CrawlerStore } from './store/types'
import { isGlobalCrawlerEnabled, isNewsCrawlerBrowserEnabled } from './enabled'
import { isCrawlerAiDispatchDryRun, isCrawlerAiDispatchEnabled } from './dispatch'
import {
  isLegacyDirectAiEnabled,
  isLegacyRssDiscoveryEnabled,
  resolveLegacyIngestionMode,
} from './legacyFlags'

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
    imageAccepted: metrics.image_accepted || 0,
    imageDuplicatesRemoved: metrics.image_duplicates_removed || 0,
    imageAdsRejected: metrics.image_ads_rejected || 0,
    imageLogosRejected: metrics.image_logos_rejected || 0,
    imageTinyRejected: metrics.image_tiny_rejected || 0,
    primaryImageJsonld: metrics.primary_image_jsonld || 0,
    primaryImageOg: metrics.primary_image_og || 0,
    primaryImageDom: metrics.primary_image_dom || 0,
    windows,
    ingestionLanes: {
      crawler: isGlobalCrawlerEnabled() ? 'Aktif' : 'Kapalı',
      legacyRssDiscovery: !isLegacyRssDiscoveryEnabled()
        ? 'Kapalı'
        : resolveLegacyIngestionMode() === 'crawler_ingestion'
          ? 'Aktif'
          : isLegacyDirectAiEnabled()
            ? 'Kısmi'
            : 'Aktif',
      legacyDirectAi: isLegacyDirectAiEnabled() ? 'Açık' : 'Kapalı',
      crawlerAiDispatch: isCrawlerAiDispatchEnabled() ? 'Açık' : 'Kapalı',
      crawlerAiDispatchDryRun: isCrawlerAiDispatchDryRun() ? 'Açık' : 'Kapalı',
      manualEditor: 'Kullanılabilir',
      last24h: {
        crawlerUrls: metrics.urls_discovered || 0,
        legacyRssUrls: metrics.legacy_rss_urls_discovered || 0,
        duplicates: (metrics.legacy_rss_urls_duplicate || 0) + (metrics.cross_pipeline_duplicate || 0),
        rawArticles: metrics.articles_fetched || 0,
        clusters: metrics.clusters_created || 0,
        automaticAi: (metrics.ai_requests || 0) + (metrics.legacy_direct_ai_blocked ? 0 : 0),
        automaticAiRequests: metrics.ai_requests || 0,
        manualAiRequests: 0,
        unmappedLegacySources: metrics.unmapped_legacy_source || 0,
        forwardedToCrawler: metrics.legacy_rss_forwarded_to_crawler || 0,
        legacyDirectAiBlocked: metrics.legacy_direct_ai_blocked || 0,
      },
      automaticAiCostUsd: {
        crawler: 0,
        legacy: 0,
        manualEditor: null as number | null,
      },
    },
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
    editorial: await editorialOps(store),
    legacyRssIngest: isLegacyRssDiscoveryEnabled()
      ? resolveLegacyIngestionMode() === 'crawler_ingestion'
        ? 'ADAPTER'
        : isLegacyDirectAiEnabled()
          ? 'ON'
          : 'OFF'
      : 'OFF',
  }
}

async function clusterFunnel(store: CrawlerStore, metrics: Record<string, number>) {
  const funnel = await store.countClusterFunnel()
  const eligible = funnel.eligible
  const watching = funnel.watching
  const rejected = funnel.rejected
  const high = funnel.highPriority
  const uniqueEvents = funnel.total
  const raw = await store.countRawArticles({ excludeDeleted: true })
  const potentialArticleJobs = raw
  const avoidedDuplicateEventJobs = Math.max(0, raw - uniqueEvents)
  return {
    rawArticles: raw,
    uniqueEvents,
    aiEligibleEvents: eligible + high,
    watching,
    rejected,
    highPriority: high,
    singleSourceClusters: funnel.singleSource,
    multiSourceClusters: funnel.multiSource,
    clustersCreated: metrics.clusters_created || uniqueEvents,
    articlesClustered: metrics.articles_clustered || 0,
    borderlineMatches: metrics.borderline_matches || 0,
    potentialArticleLevelAiJobs: potentialArticleJobs,
    uniqueEventCandidates: uniqueEvents,
    aiEligibleEventJobs: eligible + high,
    avoidedDuplicateEventJobs,
    mergeRate: raw > 0 ? Number((1 - uniqueEvents / Math.max(raw, 1)).toFixed(4)) : 0,
    aiCostUsd: 0,
    actualAiCostUsd: 0,
    estimatedCostLabel: 'COST_UNKNOWN' as const,
  }
}

async function editorialOps(store: CrawlerStore) {
  const articleCounts = await store.countEditorialStatuses()
  const funnel = await store.countClusterFunnel()
  const urlsDiscovered = (await store.getTodayMetrics()).urls_discovered || 0
  const rawTotal = await store.countRawArticles({ excludeDeleted: true })
  const inReview = articleCounts.IN_REVIEW || 0
  return {
    approvedForAi: funnel.approvedForAi,
    editorRejected: (articleCounts.REJECTED || 0) + funnel.rejected,
    archived: (articleCounts.ARCHIVED || 0) + funnel.archived,
    inReview,
    watching: funnel.watching,
    eligible: funnel.eligible,
    aiWaiting: funnel.approvedForAi,
    highPriority: funnel.highPriority + funnel.editorialHigh,
    breaking: funnel.breaking,
    staleApproved: funnel.staleApproved,
    olderThan24h: funnel.olderThan24h,
    rawArticles: rawTotal,
    uniqueEvents: funnel.total,
    automaticAiRequests: 0,
    automaticAiCostUsd: 0,
    actualAiCostUsd: 0,
    estimatedCostLabel: 'COST_UNKNOWN' as const,
    dispatchEnabled: isCrawlerAiDispatchEnabled(),
    pipeline: {
      discovered: urlsDiscovered,
      rawArticles: rawTotal,
      clusters: funnel.total,
      preAi: funnel.watching + funnel.eligible + funnel.highPriority,
      editorApproved: funnel.approvedForAi,
      aiDispatch: 0,
    },
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

