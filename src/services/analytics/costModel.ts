/** Cost model for Neon-backed analytics (ingest off until explicitly enabled). */

export interface AnalyticsCostEstimate {
  pageviewsPerDay: number
  writesPerDay: number
  cmsReadsPerDay: number
  rawRowStorage: number
  hourlyRowStorage: number
  dailyRowStorage: number
  cronJobsPerDay: number
  /** USD/day estimate; COST_UNKNOWN when pricing not configured. */
  estimatedUsdPerDay: number | 'COST_UNKNOWN'
  notes: string[]
}

const RAW_DAYS = 7
const HOURLY_DAYS = 90
const DAILY_DAYS = 730
/** CMS dashboard: 30 daily rows + a handful of hourly summaries, a few times/day. */
const CMS_READS_PER_OPEN = 40
const CMS_OPENS_PER_DAY = 20

/**
 * Neon compute/storage pricing varies by plan. Until an explicit unit price is
 * configured via env, never assume $0 — report COST_UNKNOWN.
 */
export function neonUnitPriceUsd(): number | null {
  const raw = process.env.ANALYTICS_NEON_USD_PER_MILLION_WRITES?.trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function estimateAnalyticsCost(pageviewsPerDay: number): AnalyticsCostEstimate {
  const bufferInserts = pageviewsPerDay * 1.2
  const hourlyUpserts = 24 * 8
  const dailyUpserts = 8
  const writesPerDay = Math.round(bufferInserts + hourlyUpserts + dailyUpserts)
  const unit = neonUnitPriceUsd()
  const estimatedUsdPerDay: number | 'COST_UNKNOWN' =
    unit == null ? 'COST_UNKNOWN' : Number(((writesPerDay / 1_000_000) * unit).toFixed(4))
  return {
    pageviewsPerDay,
    writesPerDay,
    cmsReadsPerDay: CMS_READS_PER_OPEN * CMS_OPENS_PER_DAY,
    rawRowStorage: Math.round(pageviewsPerDay * RAW_DAYS * 1.2),
    hourlyRowStorage: 24 * HOURLY_DAYS,
    dailyRowStorage: DAILY_DAYS,
    cronJobsPerDay: 25,
    estimatedUsdPerDay,
    notes: [
      'Architecture: client event → buffer insert (Neon) → hourly/daily aggregates. CMS reads aggregates only.',
      'No Firebase pageview restore. Production ingest remains OFF until ANALYTICS_NEON_INGEST_ENABLED=true.',
      `Raw retention ${RAW_DAYS}d, hourly ${HOURLY_DAYS}d, daily ${DAILY_DAYS}d.`,
      unit == null
        ? 'COST_UNKNOWN: set ANALYTICS_NEON_USD_PER_MILLION_WRITES to price writes; never assume $0.'
        : `Priced at $${unit}/M writes via ANALYTICS_NEON_USD_PER_MILLION_WRITES.`,
    ],
  }
}

export function analyticsCostReport() {
  return {
    ingestEnabled: process.env.ANALYTICS_NEON_INGEST_ENABLED?.trim().toLowerCase() === 'true',
    '10k': estimateAnalyticsCost(10_000),
    '100k': estimateAnalyticsCost(100_000),
    '1m': estimateAnalyticsCost(1_000_000),
  }
}
