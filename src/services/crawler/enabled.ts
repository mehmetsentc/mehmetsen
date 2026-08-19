function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function envTrue(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on'
}

/**
 * Master crawl switch. Default OFF.
 * GLOBAL_CRAWLER_ENABLED is canonical; NEWS_CRAWLER_ENABLED remains an alias.
 */
export function isGlobalCrawlerEnabled(): boolean {
  return envTrue('GLOBAL_CRAWLER_ENABLED') || envTrue('NEWS_CRAWLER_ENABLED')
}

/** @deprecated Use isGlobalCrawlerEnabled */
export function isNewsCrawlerEnabled(): boolean {
  return isGlobalCrawlerEnabled()
}

/** Playwright/Chromium fallback. Never the default fetch path. */
export function isNewsCrawlerBrowserEnabled(): boolean {
  return envTrue('NEWS_CRAWLER_BROWSER_ENABLED') || envTrue('CRAWLER_BROWSER_ENABLED')
}

export function defaultCrawlIntervalSeconds(
  band: 'high' | 'normal' | 'local' | 'low' = 'normal'
): number {
  if (band === 'high') return 120
  if (band === 'local') return 600
  if (band === 'low') return 1800
  return 300
}

export function crawlerTickLimits() {
  return {
    maxSourcesPerTick: clamp(intEnv('NEWS_CRAWLER_MAX_SOURCES_PER_TICK', 8), 1, 40),
    maxFetchPerTick: clamp(intEnv('NEWS_CRAWLER_MAX_FETCH_PER_TICK', 12), 1, 50),
    maxFetchPerSource: clamp(intEnv('NEWS_CRAWLER_MAX_FETCH_PER_SOURCE', 2), 1, 20),
    maxDiscoverUrlsPerSource: clamp(intEnv('NEWS_CRAWLER_MAX_DISCOVER_URLS', 40), 5, 200),
    maxTickRuntimeMs: clamp(intEnv('NEWS_CRAWLER_MAX_TICK_RUNTIME_MS', 50_000), 5_000, 55_000),
    defaultFreshnessHours: clamp(intEnv('NEWS_CRAWLER_FRESHNESS_HOURS', 48), 1, 168),
    requestTimeoutMs: clamp(intEnv('NEWS_CRAWLER_TIMEOUT_MS', 12_000), 3_000, 30_000),
    maxBodyBytes: clamp(intEnv('NEWS_CRAWLER_MAX_BODY_BYTES', 1_500_000), 50_000, 4_000_000),
    minRequestIntervalMs: clamp(intEnv('NEWS_CRAWLER_MIN_INTERVAL_MS', 1_500), 0, 30_000),
    domainConcurrency: 1,
    maxChildSitemaps: 3,
    degradeAfterFailures: 3,
    pauseAfterFailures: 6,
  }
}

export function crawlIntervalForPriority(band: 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'): number {
  if (band === 'BREAKING') return 90
  if (band === 'HIGH') return 180
  if (band === 'LOW') return 1200
  return 360
}

export function numericPriorityForBand(band: 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'): number {
  if (band === 'BREAKING') return 90
  if (band === 'HIGH') return 70
  if (band === 'LOW') return 30
  return 50
}
