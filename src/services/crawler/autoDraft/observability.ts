/**
 * Phase 4E — CMS observability counters without fake zeros on outage.
 */

export type MetricValue<T> =
  | { available: true; value: T }
  | { available: false; displayTr: 'Veri alınamadı' }

export function metricOk<T>(value: T): MetricValue<T> {
  return { available: true, value }
}

export function metricUnavailable<T = never>(): MetricValue<T> {
  return { available: false, displayTr: 'Veri alınamadı' }
}

export function formatMetricNumber(m: MetricValue<number> | null | undefined): string {
  if (!m || !m.available) return 'Veri alınamadı'
  return String(m.value)
}

export type ControlledAutoDraftOpsCounters = {
  urlsDiscoveredToday: MetricValue<number>
  articlesExtractedToday: MetricValue<number>
  eventsCreatedToday: MetricValue<number>
  multiSourceEvents: MetricValue<number>
  aiReady: MetricValue<number>
  aiJobsToday: MetricValue<number>
  aiDraftsCompleted: MetricValue<number>
  aiFailures: MetricValue<number>
  aiSpendTodayUsd: MetricValue<number | null>
  aiSpendMonthUsd: MetricValue<number | null>
}

/** Build counters; any missing/null source → Veri alınamadı (never coerce outage to 0). */
export function buildOpsCounters(input: {
  dataAvailable: boolean
  urlsDiscoveredToday?: number | null
  articlesExtractedToday?: number | null
  eventsCreatedToday?: number | null
  multiSourceEvents?: number | null
  aiReady?: number | null
  aiJobsToday?: number | null
  aiDraftsCompleted?: number | null
  aiFailures?: number | null
  aiSpendTodayUsd?: number | null
  aiSpendMonthUsd?: number | null
}): ControlledAutoDraftOpsCounters {
  const wrap = (n: number | null | undefined): MetricValue<number> => {
    if (!input.dataAvailable || n == null || !Number.isFinite(n)) return metricUnavailable()
    return metricOk(n)
  }
  const wrapMoney = (n: number | null | undefined): MetricValue<number | null> => {
    if (!input.dataAvailable) return metricUnavailable()
    if (n == null) return metricOk(null)
    if (!Number.isFinite(n)) return metricUnavailable()
    return metricOk(n)
  }
  return {
    urlsDiscoveredToday: wrap(input.urlsDiscoveredToday),
    articlesExtractedToday: wrap(input.articlesExtractedToday),
    eventsCreatedToday: wrap(input.eventsCreatedToday),
    multiSourceEvents: wrap(input.multiSourceEvents),
    aiReady: wrap(input.aiReady),
    aiJobsToday: wrap(input.aiJobsToday),
    aiDraftsCompleted: wrap(input.aiDraftsCompleted),
    aiFailures: wrap(input.aiFailures),
    aiSpendTodayUsd: wrapMoney(input.aiSpendTodayUsd),
    aiSpendMonthUsd: wrapMoney(input.aiSpendMonthUsd),
  }
}
