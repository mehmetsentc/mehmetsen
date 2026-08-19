/** Cost model for Neon-backed analytics (ingest off until explicitly enabled). */

export interface AnalyticsCostEstimate {
  pageviewsPerDay: number
  writesPerDay: number
  cmsReadsPerDay: number
  rawRowStorage: number
  hourlyRowStorage: number
  dailyRowStorage: number
  cronJobsPerDay: number
  notes: string[]
}

const RAW_DAYS = 7
const HOURLY_DAYS = 90
const DAILY_DAYS = 730
/** CMS dashboard: 30 daily rows + a handful of hourly summaries, a few times/day. */
const CMS_READS_PER_OPEN = 40
const CMS_OPENS_PER_DAY = 20

export function estimateAnalyticsCost(pageviewsPerDay: number): AnalyticsCostEstimate {
  const bufferInserts = pageviewsPerDay * 1.2
  const hourlyUpserts = 24 * 8
  const dailyUpserts = 8
  const writesPerDay = Math.round(bufferInserts + hourlyUpserts + dailyUpserts)
  return {
    pageviewsPerDay,
    writesPerDay,
    cmsReadsPerDay: CMS_READS_PER_OPEN * CMS_OPENS_PER_DAY,
    rawRowStorage: Math.round(pageviewsPerDay * RAW_DAYS * 1.2),
    hourlyRowStorage: 24 * HOURLY_DAYS,
    dailyRowStorage: DAILY_DAYS,
    cronJobsPerDay: 25,
    notes: [
      'Client event → light ingest → buffer insert (no Firebase write).',
      'Hourly cron folds buffer into analytics_hourly; daily cron folds into analytics_daily.',
      'CMS reads only aggregate tables (7d/30d = tens of rows, never raw scan).',
      `Raw retention ${RAW_DAYS}d, hourly ${HOURLY_DAYS}d, daily ${DAILY_DAYS}d.`,
      'Production ingest remains disabled until ANALYTICS_NEON_INGEST_ENABLED=true.',
    ],
  }
}

export function analyticsCostReport() {
  return {
    '10k': estimateAnalyticsCost(10_000),
    '100k': estimateAnalyticsCost(100_000),
    '1m': estimateAnalyticsCost(1_000_000),
  }
}
