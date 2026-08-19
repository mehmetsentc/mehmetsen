import { normalizeArticleUrl, urlHashFor } from './url/normalize'
import { laneFromDiscoveryType, mergeDiscoveryLanes, type DiscoveryLane } from './discovery/lanes'
import type { CrawlerStore } from './store/types'

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
