import { urlHashFor } from '../url/normalize'
import type { CrawlerStore } from '../store/types'
import type { CrawlerLogicalQueue, CrawlerUrlStatus, RawArticleRecord } from '../types'

/** Terminal discovery-memory state: seen/processed, never re-queued for fetch. */
export const DISCOVERY_MEMORY_STATUS: CrawlerUrlStatus = 'EXTRACTED'
export const DISCOVERY_MEMORY_QUEUE: CrawlerLogicalQueue = 'CLUSTER_QUEUE'

const FETCHABLE: CrawlerUrlStatus[] = ['PENDING_FETCH', 'FETCHING']

/**
 * Preserve the lightweight source+normalized-URL identity after raw-article
 * content is deleted or tombstoned. Does not keep article body.
 */
export async function rememberDiscoveryIdentity(
  store: CrawlerStore,
  article: Pick<
    RawArticleRecord,
    'sourceId' | 'discoveredUrlId' | 'originalUrl' | 'normalizedUrl' | 'canonicalUrl' | 'urlHash'
  >
): Promise<void> {
  const normalized = article.normalizedUrl || article.canonicalUrl || article.originalUrl
  if (!normalized) return
  const urlHash = article.urlHash || urlHashFor(normalized)
  const patch = { status: DISCOVERY_MEMORY_STATUS, logicalQueue: DISCOVERY_MEMORY_QUEUE }

  if (article.discoveredUrlId) {
    await store.updateDiscoveredUrl(article.discoveredUrlId, patch)
    return
  }

  const existing = await store.getDiscoveredByHash(urlHash)
  if (existing) {
    if (FETCHABLE.includes(existing.status)) {
      await store.updateDiscoveredUrl(existing.id, patch)
    }
    return
  }

  await store.insertDiscoveredUrl({
    sourceId: article.sourceId,
    url: article.originalUrl || normalized,
    normalizedUrl: normalized,
    urlHash,
    status: DISCOVERY_MEMORY_STATUS,
    logicalQueue: DISCOVERY_MEMORY_QUEUE,
  })
}
