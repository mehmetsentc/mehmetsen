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
  return {
    enabled: isGlobalCrawlerEnabled(),
    aiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    browserEnabled: isNewsCrawlerBrowserEnabled(),
    activeSources: await store.countActiveSources(),
    sourcesDue: await store.countDueSources(now),
    sourcesCheckedToday: metrics.sources_checked || 0,
    urlsDiscovered: metrics.urls_discovered || 0,
    newUrls: metrics.urls_new || 0,
    articlesFetched: metrics.articles_fetched || 0,
    extractionSuccess,
    extractionFailed: extractionFail,
    duplicatesRemoved: metrics.duplicates_removed || 0,
    aiCandidates: metrics.ai_candidates || 0,
    aiRequests: metrics.ai_requests || 0,
    aiRequestsAvoided: metrics.ai_requests_avoided || 0,
    httpRequests: http,
    browserRequests: browser,
    browserHttpRatio: http > 0 ? browser / http : 0,
    averageFetchTimeMs: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    failedSources: await store.countFailedSources(),
    queues: {
      discovery: await store.countQueue('DISCOVERY_QUEUE'),
      articleFetch: await store.countQueue('ARTICLE_FETCH_QUEUE'),
      extraction: await store.countQueue('EXTRACTION_QUEUE'),
      cluster: await store.countQueue('CLUSTER_QUEUE'),
      aiCandidate: await store.countQueue('AI_CANDIDATE_QUEUE'),
      failed: await store.countQueue('FAILED_QUEUE'),
    },
  }
}

