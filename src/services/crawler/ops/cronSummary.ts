import { cmsLabel } from '@/services/cms/uiLabels'

export type CronLane = 'CRAWLER' | 'RSS RADAR' | 'LEGACY' | 'AI DISPATCH'

export type CronJobStatusTr = 'Çalışıyor' | 'Başarılı' | 'Başarısız' | 'Bekliyor' | 'Devre Dışı' | 'Boşta'

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
  idleNote?: string
  urlsDiscovered?: number
  urlsNew?: number
  urlsDuplicate?: number
  forwardedToCrawler?: number
  unmapped?: number
  fetchPending?: number
  extracted?: number
  extractionFailed?: number
}

export const CRON_LANE_ORDER: CronLane[] = ['CRAWLER', 'RSS RADAR', 'LEGACY', 'AI DISPATCH']

export const CRON_LANE_EXPLAIN: Record<CronLane, string> = {
  CRAWLER: 'Keşif → tam sayfa çekim → çıkarım → kümeleme. Boşta olmak bozuk demek değildir.',
  'RSS RADAR': 'RSS yalnızca radar: URL inbox’a yazar; tam sayfa crawler kazanır. Aynı URL tek fetch.',
  LEGACY: 'Eski haber kuyruğu / legacy cron. AI kapalıyken drain atlanır — bu beklenen durumdur.',
  'AI DISPATCH': 'Event-first AI hazırlığı. Provider bağlı değil; CRAWLER_AI_DISPATCH_ENABLED=false.',
}

export const CRAWLER_CRON_CATALOG: Array<
  Pick<CronJobSummary, 'name' | 'lane' | 'flowLane' | 'nextRunHint' | 'trigger' | 'idleNote'> & { metricKeys?: string[] }
> = [
  {
    name: 'Crawler tick',
    lane: 'CRAWLER',
    nextRunHint: 'Her ~1 dk (GLOBAL_CRAWLER)',
    trigger: 'schedule',
    idleNote: 'Tick çalışıyor ama iş yoksa Boşta = sağlıklı.',
    metricKeys: ['sources_checked', 'articles_fetched', 'extraction_success', 'extraction_fail'],
  },
  {
    name: 'RSS RADAR',
    lane: 'RSS RADAR',
    flowLane: 'RSS DISCOVERY',
    nextRunHint: 'Legacy cron + adapter',
    trigger: 'schedule',
    idleNote: 'Radar sessizliği = kaynakta yeni URL yok; crawler bozulmuş sayılmaz.',
    metricKeys: [
      'legacy_rss_urls_discovered',
      'legacy_rss_urls_new',
      'legacy_rss_urls_duplicate',
      'legacy_rss_forwarded_to_crawler',
      'unmapped_legacy_source',
    ],
  },
  {
    name: 'CRAWLER DISCOVERY',
    lane: 'CRAWLER',
    flowLane: 'CRAWLER DISCOVERY',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['urls_discovered', 'urls_new'],
  },
  {
    name: 'FULL EXTRACTION',
    lane: 'CRAWLER',
    flowLane: 'FULL EXTRACTION',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['articles_fetched', 'extraction_success', 'extraction_fail', 'low_confidence'],
  },
  {
    name: 'CLUSTERING',
    lane: 'CRAWLER',
    flowLane: 'CLUSTERING',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['clusters_created', 'articles_clustered'],
  },
  {
    name: 'Görsel çıkarımı',
    lane: 'CRAWLER',
    nextRunHint: 'Tick içinde',
    trigger: 'schedule',
    metricKeys: ['image_accepted', 'image_candidates_rejected', 'articles_with_primary_image'],
  },
  {
    name: 'Legacy queue drain',
    lane: 'LEGACY',
    nextRunHint: 'LEGACY_DIRECT_AI_ENABLED=false iken atlanır',
    trigger: 'schedule',
    idleNote: 'AI kapalı → drain atlanır. Bu hata değildir.',
    metricKeys: [],
  },
  {
    name: 'AI Dispatch (event)',
    lane: 'AI DISPATCH',
    nextRunHint: 'Kapalı — provider wired değil',
    trigger: 'manual',
    idleNote: 'Gelecekte: insan onaylı 1 olay → en fazla 1 AI job. Canary yok.',
    metricKeys: [],
  },
]

export function cronStatusTr(status: string | null | undefined, enabled = true): CronJobStatusTr {
  if (!enabled) return 'Devre Dışı'
  if (status === 'running') return 'Çalışıyor'
  if (status === 'success') return 'Başarılı'
  if (status === 'failed') return 'Başarısız'
  if (status === 'idle') return 'Boşta'
  if (status === 'skipped' || status === 'pending') return 'Bekliyor'
  return cmsLabel(status, 'Bekliyor') === 'Bekliyor' ? 'Bekliyor' : (cmsLabel(status) as CronJobStatusTr)
}

export function buildCrawlerCronSummaries(input: {
  enabled: boolean
  metrics: Record<string, number>
  lastDiscoveryAt: Date | string | null
  lastExtractionAt: Date | string | null
  fetchPending?: number
  aiDispatchEnabled?: boolean
  legacyAiEnabled?: boolean
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

    let enabledForJob = input.enabled || job.lane === 'RSS RADAR'
    if (job.lane === 'AI DISPATCH') enabledForJob = Boolean(input.aiDispatchEnabled)
    if (job.lane === 'LEGACY') enabledForJob = Boolean(input.legacyAiEnabled)

    let status: CronJobStatusTr
    if (!enabledForJob && (job.lane === 'AI DISPATCH' || job.lane === 'LEGACY')) {
      status = 'Devre Dışı'
    } else if (!input.enabled && job.lane === 'CRAWLER') {
      status = 'Devre Dışı'
    } else if (hasActivity) {
      status = failed > success && processed > 0 ? 'Başarısız' : 'Başarılı'
    } else if (job.lane === 'CRAWLER' || job.lane === 'RSS RADAR') {
      status = 'Boşta'
    } else {
      status = cronStatusTr('pending', enabledForJob)
    }

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
      idleNote: job.idleNote || CRON_LANE_EXPLAIN[job.lane],
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
