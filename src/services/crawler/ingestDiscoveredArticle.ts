import { normalizeArticleUrl, urlHashFor } from './url/normalize'
import { laneFromDiscoveryType, mergeDiscoveryLanes, type DiscoveryLane } from './discovery/lanes'
import type { CrawlerStore } from './store/types'
import { isGuidEarlyDedupEnabled } from './enabled'

export type DiscoveryType = 'RSS' | 'ATOM' | 'SITEMAP' | 'LISTING' | 'MANUAL'

export interface IngestDiscoveredArticleInput {
  discoveryType: DiscoveryType
  discoveryLane?: DiscoveryLane
  sourceId: string
  originalUrl: string
  titleHint?: string | null
  publishedAtHint?: Date | number | string | null
  guid?: string | null
  discoveryPrimaryImageCandidate?: string | null
  feedMetadata?: Record<string, unknown> | null
  discoveredAt?: Date
  /**
   * RSS description/body is discovery metadata only. Callers must not treat it
   * as a full article; this field is stored as provenance and never used as body.
   */
  rssDescription?: string | null
}

export type IngestDiscoveredArticleResult = {
  status: 'inserted' | 'duplicate' | 'invalid'
  normalizedUrl?: string
  urlHash?: string
  discoveryType: DiscoveryType
  discoveryLane: DiscoveryLane
  discoveryLanes?: DiscoveryLane[]
  titleHintUsedAsArticle: false
  rssDescriptionUsedAsArticle: false
  refetchScheduled: false
}

function parsePublishedAt(value: IngestDiscoveredArticleInput['publishedAtHint']): Date | null {
  if (!value) return null
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}

/**
 * Canonical ingestion boundary for crawler + legacy RSS adapters.
 * Inserts into discovered_article_urls only. Does not call AI, does not
 * write Firestore news, does not treat RSS snippets as article bodies.
 */
export async function ingestDiscoveredArticle(
  store: CrawlerStore,
  input: IngestDiscoveredArticleInput,
  opts?: { baseUrl?: string }
): Promise<IngestDiscoveredArticleResult> {
  const discoveryLane = laneFromDiscoveryType(input.discoveryType, input.discoveryLane)
  const base = {
    discoveryType: input.discoveryType,
    discoveryLane,
    titleHintUsedAsArticle: false as const,
    rssDescriptionUsedAsArticle: false as const,
    refetchScheduled: false as const,
  }

  const normalized = normalizeArticleUrl(input.originalUrl, opts?.baseUrl)
  if (!normalized) {
    return { status: 'invalid', ...base }
  }

  const urlHash = urlHashFor(normalized)
  const existing = await store.getDiscoveredByHash(urlHash)
  const publishedAtHint = parsePublishedAt(input.publishedAtHint)
  const imageCandidate = input.discoveryPrimaryImageCandidate?.trim() || null

  if (existing) {
    // Permanent URL memory: refresh provenance metadata only. Never reset
    // status back to PENDING_FETCH — a previously seen URL must not re-queue.
    const lanes = mergeDiscoveryLanes(existing.discoveryLanes, discoveryLane)
    await store.updateDiscoveredUrl(existing.id, {
      discoveryLanes: lanes,
      titleHint: existing.titleHint || input.titleHint || null,
      guid: existing.guid || input.guid || null,
      discoveryPrimaryImageCandidate: existing.discoveryPrimaryImageCandidate || imageCandidate,
      rssDescription: existing.rssDescription || input.rssDescription || null,
      feedMetadata: existing.feedMetadata || input.feedMetadata || null,
      publishedAtHint: existing.publishedAtHint || publishedAtHint,
    })
    return {
      status: 'duplicate',
      normalizedUrl: normalized,
      urlHash,
      discoveryLanes: lanes,
      ...base,
    }
  }

  // SOURCE-DEDUP-1: RSS/Atom GUID early-dedup fallback. The URL-hash check above found no
  // match (the URL genuinely looks new — e.g. a tracking param changed, or the publisher
  // reissued a slightly different link), but the SAME source's own feed already carries this
  // exact GUID. Per spec a GUID is only guaranteed unique WITHIN one feed, so this check is
  // strictly source-scoped (store.getDiscoveredBySourceAndGuid) — it can never suppress a
  // different source's coverage of the same event. Conservative length guard filters out
  // degenerate/placeholder GUID values; source-scoping already makes numeric/short GUIDs safe,
  // this is extra defense-in-depth only. NEWS_CRAWLER_GUID_DEDUP_ENABLED=false disables it.
  const guid = input.guid?.trim() || null
  if (guid && guid.length >= 8 && isGuidEarlyDedupEnabled()) {
    const byGuid = await store.getDiscoveredBySourceAndGuid(input.sourceId, guid)
    if (byGuid) {
      const lanes = mergeDiscoveryLanes(byGuid.discoveryLanes, discoveryLane)
      await store.updateDiscoveredUrl(byGuid.id, {
        discoveryLanes: lanes,
        titleHint: byGuid.titleHint || input.titleHint || null,
        discoveryPrimaryImageCandidate: byGuid.discoveryPrimaryImageCandidate || imageCandidate,
        rssDescription: byGuid.rssDescription || input.rssDescription || null,
        feedMetadata: byGuid.feedMetadata || input.feedMetadata || null,
        publishedAtHint: byGuid.publishedAtHint || publishedAtHint,
      })
      return {
        status: 'duplicate',
        normalizedUrl: normalized,
        urlHash,
        discoveryLanes: lanes,
        ...base,
      }
    }
  }

  const result = await store.insertDiscoveredUrl({
    sourceId: input.sourceId,
    url: normalized,
    normalizedUrl: normalized,
    urlHash,
    publishedAtHint,
    discoveryLane,
    discoveryLanes: [discoveryLane],
    titleHint: input.titleHint ?? null,
    guid: input.guid ?? null,
    discoveryPrimaryImageCandidate: imageCandidate,
    rssDescription: input.rssDescription ?? null,
    feedMetadata: input.feedMetadata ?? null,
  })

  if (result === 'duplicate') {
    const raced = await store.getDiscoveredByHash(urlHash)
    return {
      status: 'duplicate',
      normalizedUrl: normalized,
      urlHash,
      discoveryLanes: raced?.discoveryLanes,
      ...base,
    }
  }

  return {
    status: 'inserted',
    normalizedUrl: normalized,
    urlHash,
    discoveryLanes: [discoveryLane],
    ...base,
  }
}
