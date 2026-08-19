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
    maxSourcesPerTick: clamp(intEnv('NEWS_CRAWLER_MAX_SOURCES_PER_TICK', 3), 1, 20),
    maxFetchPerTick: clamp(intEnv('NEWS_CRAWLER_MAX_FETCH_PER_TICK', 8), 1, 50),
    maxDiscoverUrlsPerSource: clamp(intEnv('NEWS_CRAWLER_MAX_DISCOVER_URLS', 50), 5, 200),
    requestTimeoutMs: clamp(intEnv('NEWS_CRAWLER_TIMEOUT_MS', 12_000), 3_000, 30_000),
    maxBodyBytes: clamp(intEnv('NEWS_CRAWLER_MAX_BODY_BYTES', 1_500_000), 50_000, 4_000_000),
    minRequestIntervalMs: clamp(intEnv('NEWS_CRAWLER_MIN_INTERVAL_MS', 1_500), 0, 30_000),
    domainConcurrency: 1,
    maxChildSitemaps: 3,
  }
}
