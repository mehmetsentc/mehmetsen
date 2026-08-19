/**
 * Shared RSS worker — fetch → fingerprint diff → enqueue → sync fingerprints.
 */

import { isLiveBroadcastContent } from '@/lib/liveBroadcastDetect'
import { normalizeCitySlug } from '@/constants/cities'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { fetchRssItems, type RssFeedItem } from '@/services/rss/rssFetcher'
import { getRssSourceById, type RssSourceDefinition } from '@/services/rss/sources'
import { detectArticleChanges } from '@/services/newsroom/detection/changeDetector'
import {
  loadFingerprintsForHashes,
  markFingerprintRemoved,
  upsertSourceFingerprint,
} from '@/services/newsroom/detection/sourceFingerprint'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import { isEnqueueSkipId } from '@/services/newsroom/queue/queueQualityCompare'
import { DEFAULT_RSS_MAX_AGE_MS } from '@/services/newsroom/queue/freshness'
import type { EditorId, NewsroomArticleInput, NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import {
  isLegacyDirectAiEnabled,
  isLegacyRssDiscoveryEnabled,
  resolveLegacyIngestionMode,
} from '@/services/crawler/legacyFlags'
import {
  forwardLegacyRssItemToCrawler,
  recordLegacyDirectAiBlocked,
  resolveLegacyCrawlerStore,
  shouldSkipOwnedLegacySource,
} from '@/services/crawler/legacyRssAdapter'

// ─── Canlı yayın + tanıtım içerik filtreleri ───────────────────────────────
// Eşleşen RSS haberleri hiç enqueue edilmez; fingerprint yine yazılır.
const PROMO_CONTENT_PATTERNS: RegExp[] = [
  /sosyal medya hesaplarımızı takip etmeyi unutmayın/i,
  /whatsapp\.com\/channel\//i,
  /bsky\.app\/profile\//i,
  /t\.me\/[a-z0-9_]+/i,
]

function isSkippableRssItem(title: string, summary: string, content: string): boolean {
  if (isLiveBroadcastContent(title, content, summary)) return true
  const body = summary + ' ' + content
  if (PROMO_CONTENT_PATTERNS.some((p) => p.test(body))) return true
  return false
}
// ───────────────────────────────────────────────────────────────────────────


export interface RssWorkerOptions {
  workerId: EditorId
  editorType: NewsroomArticleInput['editorType']
  sourceIds?: readonly string[]
  /** Dynamic sources (e.g. per-province Google News) — takes precedence over sourceIds. */
  sources?: RssSourceDefinition[]
  forcedCategoryId?: string
  maxItemsPerSource?: number
  /** Only accept RSS items newer than this many milliseconds (e.g. 24 * 60 * 60 * 1000). */
  maxAgeMs?: number
  enrichInput?: (
    item: RssFeedItem,
    source: RssSourceDefinition
  ) => Partial<NewsroomArticleInput>
}

function mergeRunResult(target: NewsroomRunResult, partial: NewsroomRunResult): void {
  target.sourcesChecked += partial.sourcesChecked
  target.itemsFetched += partial.itemsFetched
  target.itemsNew += partial.itemsNew
  target.itemsSkipped += partial.itemsSkipped
  target.itemsFailed += partial.itemsFailed
  target.draftsCreated += partial.draftsCreated
  target.autoPublished += partial.autoPublished
  target.lowConfidence += partial.lowConfidence
  target.errors.push(...partial.errors)
  target.durationMs += partial.durationMs
}

function resolveSources(options: RssWorkerOptions): RssSourceDefinition[] {
  if (options.sources?.length) return options.sources
  return (options.sourceIds ?? [])
    .map((id) => getRssSourceById(id))
    .filter((s): s is RssSourceDefinition => Boolean(s))
}

export async function runRssWorker(options: RssWorkerOptions): Promise<NewsroomRunResult> {
  const started = Date.now()
  const result = emptyNewsroomResult(options.workerId)
  const mode = resolveLegacyIngestionMode()
  result.mode = mode
  result.aiRequests = 0
  result.discovered = 0
  result.inserted = 0
  const unmapped = new Set<string>()

  if (mode === 'legacy_disabled' || !isLegacyRssDiscoveryEnabled()) {
    result.durationMs = Date.now() - started
    await recordLegacyDirectAiBlocked()
    return result
  }

  const db = getAdminFirestore()
  const sources = resolveSources(options)
  const crawlerStore = !isLegacyDirectAiEnabled() ? await resolveLegacyCrawlerStore() : null
  const crawlerSources = crawlerStore ? await crawlerStore.listSources() : []

  if (sources.length === 0 && options.sourceIds?.length) {
    result.errors.push(
      `No enabled RSS sources for worker (requested: ${options.sourceIds.join(', ')})`
    )
  }

  for (const source of sources) {
    result.sourcesChecked += 1

    if (crawlerStore && (await shouldSkipOwnedLegacySource({ store: crawlerStore, sources: crawlerSources, legacySource: source }))) {
      result.itemsSkipped += 1
      continue
    }

    const maxAgeMs = options.maxAgeMs ?? DEFAULT_RSS_MAX_AGE_MS
    const minPublishedAt = Date.now() - maxAgeMs
    let items
    try {
      items = await fetchRssItems(source, {
        maxItems: options.maxItemsPerSource ?? source.maxItemsPerRun,
        minPublishedAt,
      })
    } catch (error) {
      const msg = `[${options.workerId}:${source.id}] RSS fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.warn(msg)
      result.errors.push(msg)
      continue
    }

    result.itemsFetched += items.length

    // Point-read only the hashes currently in the RSS feed instead of a
    // full 600-doc range scan. Cuts Firestore reads from ~600 → ~N_items
    // per source per run (typically 20–60). "Removed" detection is skipped
    // (stored only contains current hashes) — stale fingerprints age out.
    let stored: Awaited<ReturnType<typeof loadFingerprintsForHashes>>
    try {
      stored = await loadFingerprintsForHashes(db, source.id, items.map((i) => i.fingerprint))
    } catch (fsErr) {
      const code = (fsErr as { code?: number }).code
      const msg = `[${options.workerId}:${source.id}] Firestore read failed${code === 8 ? ' (RESOURCE_EXHAUSTED)' : ''}: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`
      console.warn(msg)
      result.errors.push(msg)
      continue
    }

    const { changes, unchanged } = detectArticleChanges(items, stored)
    result.itemsSkipped += unchanged

    for (const change of changes) {
      if (change.type === 'removed') {
        try { await markFingerprintRemoved(db, source.id, change.hash) } catch { /* non-critical */ }
        continue
      }

      const enriched = options.enrichInput?.(change.item, source) ?? {}
      const meta = source.localMeta
      const input: NewsroomArticleInput = {
        editorId: options.workerId,
        editorType: options.editorType,
        sourceLabel: change.item.source.label,
        sourceUrl: change.item.link,
        originalTitle: change.item.title,
        originalSummary: change.item.summary,
        originalContent: change.item.content,
        rssFingerprint: change.item.fingerprint,
        rssGuid: change.item.guid,
        ingestionSourceId: change.item.source.id,
        sourcePublishedAt: change.item.publishedAt,
        ...enriched,
      }
      if (options.forcedCategoryId) {
        input.forcedCategoryId = options.forcedCategoryId
      }
      if (meta && !input.forcedCitySlug) {
        const citySlug = normalizeCitySlug(meta.citySlug)
        input.forcedCitySlug = citySlug
        input.forcedCity = meta.cityName
        if (meta.district) input.forcedDistrict = meta.district
        input.extraTags = [...(input.extraTags ?? []), citySlug, ...(meta.district ? [meta.district] : [])]
      }
      if (change.item.imageUrl) {
        input.imageUrl = change.item.imageUrl
      }

      // ── Canlı yayın / tanıtım filtresi ─────────────────────────────────
      // Eşleşen haberi hiç sıraya koymuyoruz.
      // Fingerprint yine de kaydediliyor; böylece RSS güncellenip yeni
      // fingerprint üretse bile başlık hâlâ eşleştiği sürece bir sonraki
      // çalışmada da atlanır.
      if (isSkippableRssItem(
        change.item.title,
        change.item.summary,
        change.item.content,
      )) {
        try { await upsertSourceFingerprint(db, source.id, change.fingerprint) } catch { /* non-critical */ }
        result.itemsSkipped += 1
        console.log(`[${options.workerId}:${source.id}] skipped (canlı/promo): ${change.item.title.slice(0, 80)}`)
        continue
      }
      // ────────────────────────────────────────────────────────────────────

      try {
        if (!isLegacyDirectAiEnabled()) {
          result.discovered = (result.discovered ?? 0) + 1
          if (!crawlerStore) {
            result.itemsSkipped += 1
            continue
          }
          const status = await forwardLegacyRssItemToCrawler({
            store: crawlerStore,
            sources: crawlerSources,
            legacySource: source,
            item: change.item,
          })
          await upsertSourceFingerprint(db, source.id, change.fingerprint)
          if (status === 'inserted') {
            result.itemsNew += 1
            result.inserted = (result.inserted ?? 0) + 1
          } else {
            result.itemsSkipped += 1
            if (status === 'unmapped') unmapped.add(source.id)
          }
          continue
        }

        const queuedId = await enqueueNewsItem(db, {
          workerId: options.workerId,
          changeType: change.type,
          input,
          sourceId: source.id,
          fingerprintHash: change.hash,
          existingNewsId: change.existingNewsId,
        })
        await upsertSourceFingerprint(db, source.id, change.fingerprint)
        if (isEnqueueSkipId(queuedId)) {
          result.itemsSkipped += 1
        } else {
          result.itemsNew += 1
        }
      } catch (fsErr) {
        const code = (fsErr as { code?: number }).code
        const msg = `[${options.workerId}:${source.id}] enqueue failed${code === 8 ? ' (RESOURCE_EXHAUSTED)' : ''}: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`
        console.warn(msg)
        result.errors.push(msg)
        result.itemsFailed += 1
        // If quota exceeded, abort remaining items for this source
        if (code === 8) break
      }
    }
  }

  result.durationMs = Date.now() - started
  result.unmappedSources = [...unmapped]
  return result
}

export async function runRssWorkerBatches(
  options: RssWorkerOptions,
  batches: RssSourceDefinition[][]
): Promise<NewsroomRunResult> {
  const merged = emptyNewsroomResult(options.workerId)
  for (const sources of batches) {
    const partial = await runRssWorker({ ...options, sources })
    mergeRunResult(merged, partial)
  }
  return merged
}
