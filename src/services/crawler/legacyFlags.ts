/**
 * Phase 3.7 kill-switches. Defaults match production target:
 * crawler ON (separate flag), legacy RSS discovery ON, legacy direct AI OFF,
 * crawler AI dispatch OFF (see dispatch.ts).
 */

function envTrue(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on'
}

function envExplicitFalse(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === 'false' || raw === '0' || raw === 'off'
}

/** Legacy RSS/Atom/scraper discovery. Default ON. */
export function isLegacyRssDiscoveryEnabled(): boolean {
  if (envExplicitFalse('LEGACY_RSS_DISCOVERY_ENABLED')) return false
  if (process.env.LEGACY_RSS_DISCOVERY_ENABLED == null || process.env.LEGACY_RSS_DISCOVERY_ENABLED.trim() === '') {
    return true
  }
  return envTrue('LEGACY_RSS_DISCOVERY_ENABLED')
}

/**
 * Legacy newsQueue / rssEditor / process-queue DeepSeek path.
 * Default OFF — explicit true required (rollback).
 */
export function isLegacyDirectAiEnabled(): boolean {
  return envTrue('LEGACY_DIRECT_AI_ENABLED')
}

/**
 * When a legacy feed is already owned by an ACTIVE crawler source, skip
 * the extra RSS HTTP fetch. Code stays; discovery continues via crawler tick.
 * Default ON.
 */
export function isLegacyRssSkipCrawlerOwned(): boolean {
  if (envExplicitFalse('LEGACY_RSS_SKIP_CRAWLER_OWNED')) return false
  if (process.env.LEGACY_RSS_SKIP_CRAWLER_OWNED == null || process.env.LEGACY_RSS_SKIP_CRAWLER_OWNED.trim() === '') {
    return true
  }
  return envTrue('LEGACY_RSS_SKIP_CRAWLER_OWNED')
}

export type LegacyIngestionMode = 'crawler_ingestion' | 'legacy_disabled' | 'legacy_ai'

export function resolveLegacyIngestionMode(): LegacyIngestionMode {
  if (isLegacyDirectAiEnabled()) return 'legacy_ai'
  if (!isLegacyRssDiscoveryEnabled()) return 'legacy_disabled'
  return 'crawler_ingestion'
}

export function legacyDisabledPayload(reason = 'LEGACY_DIRECT_AI_ENABLED=false') {
  return {
    mode: 'legacy_disabled' as const,
    aiRequests: 0 as const,
    skipped: true,
    reason,
    discovered: 0,
    inserted: 0,
  }
}

export function crawlerIngestionPayload(discovered: number, inserted: number) {
  return {
    mode: 'crawler_ingestion' as const,
    aiRequests: 0 as const,
    discovered,
    inserted,
  }
}
