import { cmsLabel } from '@/services/cms/uiLabels'

export type CronLane = 'crawler' | 'legacy'

export type CronJobStatusTr = 'Çalışıyor' | 'Başarılı' | 'Başarısız' | 'Bekliyor' | 'Devre Dışı'

export interface CronJobSummary {
  name: string
  lane: CronLane
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
}

export const CRAWLER_CRON_CATALOG: Array<
  Pick<CronJobSummary, 'name' | 'lane' | 'nextRunHint' | 'trigger'> & { metricKeys?: string[] }
> = [
  {
    name: 'Crawler tick',
    lane: 'crawler',
    nextRunHint: 'Her 2–5 dk (GLOBAL_CRAWLER)',
    trigger: 'schedule',
    metricKeys: ['sources_checked', 'articles_fetched', 'extraction_success', 'extraction_fail'],
  },
  {
    name: 'Kaynak keşif',
    lane: 'crawler',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['urls_discovered', 'urls_new'],
  },
  {
    name: 'Makale çıkarımı',
    lane: 'crawler',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['extraction_success', 'extraction_fail', 'low_confidence'],
  },
  {
    name: 'Olay kümeleme',
    lane: 'crawler',
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
}): CronJobSummary[] {
  const lastDisc = input.lastDiscoveryAt ? new Date(input.lastDiscoveryAt).toISOString() : null
  const lastExt = input.lastExtractionAt ? new Date(input.lastExtractionAt).toISOString() : null
  return CRAWLER_CRON_CATALOG.map((job) => {
    const processed = (job.metricKeys || []).reduce((sum, key) => sum + (input.metrics[key] || 0), 0)
    const failed = input.metrics.extraction_fail || input.metrics.image_extraction_failed || 0
    const success = input.metrics.extraction_success || input.metrics.articles_fetched || 0
    const skipped = input.metrics.ai_requests_avoided || 0
    const last = job.name.includes('çıkarım') || job.name.includes('küme') ? lastExt : lastDisc
    return {
      name: job.name,
      lane: 'crawler',
      lastRunAt: last,
      lastSuccessAt: success > 0 ? last : null,
      status: cronStatusTr(input.enabled ? (failed > success && processed > 0 ? 'failed' : 'success') : 'disabled', input.enabled),
      durationMs: input.metrics.averageFetchTimeMs || input.metrics.fetch_duration_ms_sum || null,
      processed,
      success,
      skipped,
      failed,
      nextRunHint: job.nextRunHint,
      trigger: job.trigger === 'schedule' ? 'Zamanlanmış' : 'Manuel',
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
