import { cmsLabel } from '@/services/cms/uiLabels'

export type CronLane = 'crawler' | 'legacy'

export type CronJobStatusTr = 'Çalışıyor' | 'Başarılı' | 'Başarısız' | 'Bekliyor' | 'Devre Dışı'

export type CronFlowLane = 'RSS DISCOVERY' | 'CRAWLER DISCOVERY' | 'FULL EXTRACTION' | 'CLUSTERING'

export interface CronJobSummary {
  name: string
  lane: CronLane
  flowLane?: CronFlowLane
  lastRunAt: string | null
  lastSuccessAt: string | null
  status: CronJobStatusTr
  durationMs: number | null
  processed: number
  success: number
  skipped: number
  failed: number
  nextRunHint: string
  trigger: string
  urlsDiscovered?: number
  urlsNew?: number
  urlsDuplicate?: number
  forwardedToCrawler?: number
  unmapped?: number
  fetchPending?: number
  extracted?: number
  extractionFailed?: number
}

export const CRAWLER_CRON_CATALOG: Array<
  Pick<CronJobSummary, 'name' | 'lane' | 'flowLane' | 'nextRunHint' | 'trigger'> & { metricKeys?: string[] }
> = [
  {
    name: 'Crawler tick',
    lane: 'crawler',
    nextRunHint: 'Her 2–5 dk (GLOBAL_CRAWLER)',
    trigger: 'schedule',
    metricKeys: ['sources_checked', 'articles_fetched', 'extraction_success', 'extraction_fail'],
  },
  {
    name: 'RSS DISCOVERY',
    lane: 'crawler',
    flowLane: 'RSS DISCOVERY',
    nextRunHint: 'Legacy cron + adapter',
    trigger: 'schedule',
    metricKeys: ['legacy_rss_urls_discovered', 'legacy_rss_urls_new', 'legacy_rss_urls_duplicate', 'legacy_rss_forwarded_to_crawler', 'unmapped_legacy_source'],
  },
  {
    name: 'CRAWLER DISCOVERY',
    lane: 'crawler',
    flowLane: 'CRAWLER DISCOVERY',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['urls_discovered', 'urls_new'],
  },
  {
    name: 'FULL EXTRACTION',
    lane: 'crawler',
    flowLane: 'FULL EXTRACTION',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['articles_fetched', 'extraction_success', 'extraction_fail', 'low_confidence'],
  },
  {
    name: 'CLUSTERING',
    lane: 'crawler',
    flowLane: 'CLUSTERING',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['clusters_created', 'articles_clustered'],
  },
  {
    name: 'Görsel çıkarımı',
    lane: 'crawler',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['image_accepted', 'image_candidates_rejected', 'articles_with_primary_image'],
  },
]

export function cronStatusTr(status: string | null | undefined, enabled = true): CronJobStatusTr {
  if (!enabled) return 'Devre Dışı'
  if (status === 'running') return 'Çalışıyor'
  if (status === 'success') return 'Başarılı'
  if (status === 'failed') return 'Başarısız'
  if (status === 'skipped' || status === 'pending') return 'Bekliyor'
  return cmsLabel(status, 'Bekliyor') === 'Bekliyor' ? 'Bekliyor' : (cmsLabel(status) as CronJobStatusTr)
}

export function buildCrawlerCronSummaries(input: {
  enabled: boolean
  metrics: Record<string, number>
  lastDiscoveryAt: Date | string | null
  lastExtractionAt: Date | string | null
  fetchPending?: number
}): CronJobSummary[] {
  const lastDisc = input.lastDiscoveryAt ? new Date(input.lastDiscoveryAt).toISOString() : null
  const lastExt = input.lastExtractionAt ? new Date(input.lastExtractionAt).toISOString() : null
  return CRAWLER_CRON_CATALOG.map((job) => {
    const processed = (job.metricKeys || []).reduce((sum, key) => sum + (input.metrics[key] || 0), 0)
    const failed = job.flowLane === 'FULL EXTRACTION' ? input.metrics.extraction_fail || 0 : 0
    const success =
      job.flowLane === 'FULL EXTRACTION'
        ? input.metrics.extraction_success || 0
        : job.flowLane === 'CLUSTERING'
          ? input.metrics.articles_clustered || 0
          : input.metrics.urls_new || input.metrics.legacy_rss_urls_new || 0
    const skipped = input.metrics.legacy_rss_urls_duplicate || input.metrics.cross_pipeline_duplicate || 0
    const last = job.flowLane === 'FULL EXTRACTION' || job.flowLane === 'CLUSTERING' ? lastExt : lastDisc
    const hasActivity = processed > 0
    const status = cronStatusTr(
      !input.enabled && job.lane === 'crawler'
        ? 'disabled'
        : hasActivity
          ? failed > success && processed > 0
            ? 'failed'
            : 'success'
          : 'pending',
      input.enabled || job.flowLane === 'RSS DISCOVERY'
    )
    return {
      name: job.name,
      lane: job.lane,
      flowLane: job.flowLane,
      lastRunAt: last,
      lastSuccessAt: success > 0 ? last : null,
      status,
      durationMs: input.metrics.averageFetchTimeMs || input.metrics.fetch_duration_ms_sum || null,
      processed,
      success,
      skipped,
      failed,
      nextRunHint: job.nextRunHint,
      trigger: job.trigger === 'schedule' ? 'Zamanlanmış' : 'Manuel',
      urlsDiscovered: input.metrics.urls_discovered || input.metrics.legacy_rss_urls_discovered || 0,
      urlsNew: input.metrics.urls_new || input.metrics.legacy_rss_urls_new || 0,
      urlsDuplicate: input.metrics.legacy_rss_urls_duplicate || input.metrics.cross_pipeline_duplicate || 0,
      forwardedToCrawler: input.metrics.legacy_rss_forwarded_to_crawler || 0,
      unmapped: input.metrics.unmapped_legacy_source || 0,
      fetchPending: input.fetchPending || 0,
      extracted: input.metrics.extraction_success || 0,
      extractionFailed: input.metrics.extraction_fail || 0,
    }
  })
}

export function historyWindow(runs: Array<{ startedAt: number }>, now = Date.now()) {
  const h24 = now - 24 * 60 * 60 * 1000
  const d7 = now - 7 * 24 * 60 * 60 * 1000
  return {
    last24h: runs.filter((r) => r.startedAt >= h24).length,
    last7d: runs.filter((r) => r.startedAt >= d7).length,
  }
}
