import {
  LOCAL_NEWS_DEFAULT_MAX_PROVINCES,
  LOCAL_NEWS_SOURCE_IDS,
} from '@/services/newsroom/config'
import { normalizeCitySlug } from '@/constants/cities'
import {
  getLocalNewsSourcesForRun,
  type LocalFeedSource,
} from '@/services/newsroom/sources/localSources'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomArticleInput, NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import type { RssSourceDefinition } from '@/services/rss/sources'

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

function buildLocalEnrichment(
  source: RssSourceDefinition
): Partial<NewsroomArticleInput> {
  const meta = source.localMeta
  if (!meta) {
    return { forcedCategoryId: 'yerel-haber' }
  }

  const citySlug = normalizeCitySlug(meta.citySlug)

  const enrichment: Partial<NewsroomArticleInput> = {
    forcedCategoryId: 'yerel-haber',
    forcedCitySlug: citySlug,
    forcedCity: meta.cityName,
    extraTags: [citySlug, ...(meta.district ? [meta.district] : [])],
  }
  if (meta.district) {
    enrichment.forcedDistrict = meta.district
  }
  return enrichment
}

/** Local worker — wire agencies + Google News per il + regional portals. */
export async function runLocalWorker(): Promise<NewsroomRunResult> {
  const started = Date.now()
  const merged = emptyNewsroomResult('local-news')

  const wire = await runRssWorker({
    workerId: 'local-news',
    editorType: 'local',
    sourceIds: LOCAL_NEWS_SOURCE_IDS,
    forcedCategoryId: 'yerel-haber',
    enrichInput: (_item, source) => buildLocalEnrichment(source),
  })
  mergeRunResult(merged, wire)

  const localSources = getLocalNewsSourcesForRun({
    maxProvinces: LOCAL_NEWS_DEFAULT_MAX_PROVINCES,
  })

  const BATCH_SIZE = Number(process.env.LOCAL_NEWS_BATCH_SIZE ?? 12)
  for (let i = 0; i < localSources.length; i += BATCH_SIZE) {
    const batch = localSources.slice(i, i + BATCH_SIZE) as LocalFeedSource[]
    const partial = await runRssWorker({
      workerId: 'local-news',
      editorType: 'local',
      sources: batch,
      forcedCategoryId: 'yerel-haber',
      enrichInput: (_item, source) => buildLocalEnrichment(source),
    })
    mergeRunResult(merged, partial)
  }

  merged.durationMs = Date.now() - started
  return merged
}

export function getLocalWorkerSourceCount(): number {
  return LOCAL_NEWS_SOURCE_IDS.length + getLocalNewsSourcesForRun().length
}
