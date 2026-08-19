import { ingestDiscoveredArticle } from './ingestDiscoveredArticle'
import {
  isLegacyRssDiscoveryEnabled,
  isLegacyRssSkipCrawlerOwned,
  resolveLegacyIngestionMode,
  type LegacyIngestionMode,
} from './legacyFlags'
import { crawlerOwnsLegacyFeed, mapLegacySourceToNewsSource } from './legacySourceMap'
import { DrizzleCrawlerStore, canUseDrizzleCrawlerStore } from './store/drizzle'
import type { CrawlerStore } from './store/types'
import type { CrawlerMetricName, NewsSourceRecord } from './types'
import type { RssFeedItem } from '@/services/rss/rssFetcher'
import type { RssSourceDefinition } from '@/services/rss/sources'
import type { EditorId, NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export interface LegacyRssForwardStats {
  mode: LegacyIngestionMode
  discovered: number
  inserted: number
  duplicates: number
  unmapped: number
  noopOwned: number
  aiRequests: 0
  unmappedSourceIds: string[]
  itemsSkipped: number
  errors: string[]
}

function emptyStats(mode: LegacyIngestionMode): LegacyRssForwardStats {
  return {
    mode,
    discovered: 0,
    inserted: 0,
    duplicates: 0,
    unmapped: 0,
    noopOwned: 0,
    aiRequests: 0,
    unmappedSourceIds: [],
    itemsSkipped: 0,
    errors: [],
  }
}

export async function resolveLegacyCrawlerStore(store?: CrawlerStore): Promise<CrawlerStore | null> {
  if (store) return store
  if (!canUseDrizzleCrawlerStore()) return null
  return new DrizzleCrawlerStore()
}

async function bump(store: CrawlerStore | null, metric: CrawlerMetricName, amount = 1) {
  if (!store) return
  await store.incrementMetric(metric, amount)
}

export async function forwardLegacyRssItemToCrawler(opts: {
  store: CrawlerStore
  sources: NewsSourceRecord[]
  legacySource: RssSourceDefinition
  item: Pick<RssFeedItem, 'link' | 'title' | 'summary' | 'content' | 'publishedAt'>
}): Promise<'inserted' | 'duplicate' | 'invalid' | 'unmapped'> {
  const mapping = mapLegacySourceToNewsSource({
    legacySourceId: opts.legacySource.id,
    feedUrl: opts.legacySource.feedUrl,
    articleUrl: opts.item.link,
    sources: opts.sources,
  })

  if (!mapping.mapped) {
    await bump(opts.store, 'unmapped_legacy_source')
    return 'unmapped'
  }

  const ingested = await ingestDiscoveredArticle(opts.store, {
    discoveryType: 'RSS',
    sourceId: mapping.source.id,
    originalUrl: opts.item.link,
    titleHint: opts.item.title,
    publishedAtHint: opts.item.publishedAt ?? null,
    rssDescription: opts.item.summary || opts.item.content || null,
    feedMetadata: { legacySourceId: opts.legacySource.id },
    discoveredAt: new Date(),
  }, { baseUrl: mapping.source.baseUrl })

  await bump(opts.store, 'legacy_rss_urls_discovered')
  await bump(opts.store, 'legacy_rss_forwarded_to_crawler')
  if (ingested.status === 'inserted') {
    await bump(opts.store, 'legacy_rss_urls_new')
    await bump(opts.store, 'urls_discovered')
    await bump(opts.store, 'urls_new')
    return 'inserted'
  }
  if (ingested.status === 'duplicate') {
    await bump(opts.store, 'legacy_rss_urls_duplicate')
    await bump(opts.store, 'cross_pipeline_duplicate')
    await bump(opts.store, 'urls_discovered')
    return 'duplicate'
  }
  return 'invalid'
}

export async function shouldSkipOwnedLegacySource(opts: {
  store: CrawlerStore
  sources: NewsSourceRecord[]
  legacySource: RssSourceDefinition
}): Promise<boolean> {
  if (!isLegacyRssSkipCrawlerOwned()) return false
  const mapping = mapLegacySourceToNewsSource({
    legacySourceId: opts.legacySource.id,
    feedUrl: opts.legacySource.feedUrl,
    sources: opts.sources,
  })
  if (!crawlerOwnsLegacyFeed({ mapping, feedUrl: opts.legacySource.feedUrl })) return false
  await bump(opts.store, 'legacy_cron_noop')
  return true
}

export function applyForwardStatsToNewsroom(
  editorId: EditorId,
  stats: LegacyRssForwardStats,
  durationMs: number
): NewsroomRunResult {
  return {
    ...emptyNewsroomResult(editorId),
    sourcesChecked: 0,
    itemsFetched: stats.discovered + stats.unmapped + stats.duplicates,
    itemsNew: stats.inserted,
    itemsSkipped: stats.duplicates + stats.unmapped + stats.noopOwned + stats.itemsSkipped,
    itemsFailed: 0,
    errors: stats.errors,
    durationMs,
    mode: stats.mode,
    discovered: stats.discovered,
    inserted: stats.inserted,
    aiRequests: 0,
    unmappedSources: stats.unmappedSourceIds,
  }
}

export async function forwardLegacySourceListToCrawler(opts: {
  editorId: EditorId
  legacySources: RssSourceDefinition[]
  itemsBySourceId: Map<string, Array<Pick<RssFeedItem, 'link' | 'title' | 'summary' | 'content' | 'publishedAt'>>>
  store?: CrawlerStore
}): Promise<NewsroomRunResult> {
  const started = Date.now()
  const mode = resolveLegacyIngestionMode()
  const stats = emptyStats(mode)

  if (mode === 'legacy_disabled' || !isLegacyRssDiscoveryEnabled()) {
    await bump(opts.store ?? (await resolveLegacyCrawlerStore()), 'legacy_cron_noop')
    return applyForwardStatsToNewsroom(opts.editorId, stats, Date.now() - started)
  }

  const store = await resolveLegacyCrawlerStore(opts.store)
  if (!store) {
    stats.errors.push('DATABASE_URL missing — legacy RSS not forwarded to crawler; AI blocked')
    await bump(null, 'legacy_direct_ai_blocked')
    return applyForwardStatsToNewsroom(opts.editorId, stats, Date.now() - started)
  }

  const sources = await store.listSources()
  const unmappedSet = new Set<string>()

  for (const legacySource of opts.legacySources) {
    if (await shouldSkipOwnedLegacySource({ store, sources, legacySource })) {
      stats.noopOwned += 1
      continue
    }
    const items = opts.itemsBySourceId.get(legacySource.id) ?? []
    for (const item of items) {
      stats.discovered += 1
      const status = await forwardLegacyRssItemToCrawler({ store, sources, legacySource, item })
      if (status === 'inserted') stats.inserted += 1
      else if (status === 'duplicate') stats.duplicates += 1
      else if (status === 'unmapped') {
        stats.unmapped += 1
        unmappedSet.add(legacySource.id)
      } else stats.itemsSkipped += 1
    }
  }

  stats.unmappedSourceIds = [...unmappedSet]
  return applyForwardStatsToNewsroom(opts.editorId, stats, Date.now() - started)
}

export async function recordLegacyDirectAiBlocked(store?: CrawlerStore) {
  const resolved = await resolveLegacyCrawlerStore(store)
  await bump(resolved, 'legacy_direct_ai_blocked')
}
