/**
 * Shared RSS worker — fetch → fingerprint diff → enqueue → sync fingerprints.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { normalizeCitySlug } from '@/constants/cities'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { fetchRssItems, type RssFeedItem } from '@/services/rss/rssFetcher'
import { getRssSourceById, type RssSourceDefinition } from '@/services/rss/sources'
import { detectArticleChanges } from '@/services/newsroom/detection/changeDetector'
import {
  loadSourceFingerprints,
  markFingerprintRemoved,
  upsertSourceFingerprint,
} from '@/services/newsroom/detection/sourceFingerprint'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import type { EditorId, NewsroomArticleInput, NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export interface RssWorkerOptions {
  workerId: EditorId
  editorType: NewsroomArticleInput['editorType']
  sourceIds?: readonly string[]
  /** Dynamic sources (e.g. per-province Google News) — takes precedence over sourceIds. */
  sources?: RssSourceDefinition[]
  forcedCategoryId?: string
  maxItemsPerSource?: number
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
  const db = getAdminFirestore()
  const sources = resolveSources(options)

  if (sources.length === 0 && options.sourceIds?.length) {
    for (const sourceId of options.sourceIds) {
      result.errors.push(`Unknown RSS source: ${sourceId}`)
    }
  }

  for (const source of sources) {
    result.sourcesChecked += 1

    let items
    try {
      items = await fetchRssItems(source, {
        maxItems: options.maxItemsPerSource ?? source.maxItemsPerRun,
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

    const stored = await loadSourceFingerprints(db, source.id)
    const { changes, unchanged } = detectArticleChanges(items, stored)
    result.itemsSkipped += unchanged

    for (const change of changes) {
      if (change.type === 'removed') {
        await markFingerprintRemoved(db, source.id, change.hash)
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

      await enqueueNewsItem(db, {
        workerId: options.workerId,
        changeType: change.type,
        input,
        sourceId: source.id,
        fingerprintHash: change.hash,
        existingNewsId: change.existingNewsId,
      })

      await upsertSourceFingerprint(db, source.id, change.fingerprint)
      result.itemsNew += 1
    }
  }

  result.durationMs = Date.now() - started
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
