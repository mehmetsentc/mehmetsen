import { normalizeArticleUrl, urlHashFor } from './url/normalize'
import type { CrawlerStore } from './store/types'

export type DiscoveryType = 'RSS' | 'ATOM' | 'SITEMAP' | 'LISTING' | 'MANUAL'

export interface IngestDiscoveredArticleInput {
  discoveryType: DiscoveryType
  sourceId: string
  originalUrl: string
  titleHint?: string | null
  publishedAtHint?: Date | number | string | null
  feedMetadata?: Record<string, unknown> | null
  discoveredAt?: Date
  /**
   * RSS description/body is discovery metadata only. Callers must not treat it
   * as a full article; this field is accepted and discarded.
   */
  rssDescription?: string | null
}

export type IngestDiscoveredArticleResult = {
  status: 'inserted' | 'duplicate' | 'invalid'
  normalizedUrl?: string
  urlHash?: string
  discoveryType: DiscoveryType
  titleHintUsedAsArticle: false
  rssDescriptionUsedAsArticle: false
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
  void input.rssDescription
  void input.feedMetadata
  void input.titleHint
  void input.discoveredAt

  const normalized = normalizeArticleUrl(input.originalUrl, opts?.baseUrl)
  if (!normalized) {
    return {
      status: 'invalid',
      discoveryType: input.discoveryType,
      titleHintUsedAsArticle: false,
      rssDescriptionUsedAsArticle: false,
    }
  }

  const urlHash = urlHashFor(normalized)
  const existing = await store.getDiscoveredByHash(urlHash)
  const result = await store.insertDiscoveredUrl({
    sourceId: input.sourceId,
    url: normalized,
    normalizedUrl: normalized,
    urlHash,
    publishedAtHint: parsePublishedAt(input.publishedAtHint),
  })

  if (existing || result === 'duplicate') {
    return {
      status: 'duplicate',
      normalizedUrl: normalized,
      urlHash,
      discoveryType: input.discoveryType,
      titleHintUsedAsArticle: false,
      rssDescriptionUsedAsArticle: false,
    }
  }

  return {
    status: 'inserted',
    normalizedUrl: normalized,
    urlHash,
    discoveryType: input.discoveryType,
    titleHintUsedAsArticle: false,
    rssDescriptionUsedAsArticle: false,
  }
}
