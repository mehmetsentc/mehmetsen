/**
 * Combined city job listing sync: İŞKUR + Kariyer.net.
 * Cron `/api/cron/iskur-jobs` runs both so /is-ilanlari stays populated.
 * Optional `city` runs a single province (Vercel schedules one cron per city).
 */

import { syncIskurJobListings } from '@/services/jobListingSyncService'
import { syncKariyerJobListings } from '@/services/kariyerJobListingSyncService'
import type { JobListingSyncResult } from '@/types/jobListing'

export interface CombinedJobListingSyncResult {
  iskur: JobListingSyncResult
  kariyer: JobListingSyncResult
  scraped: number
  upserted: number
  failedCities: string[]
  completedAt: string
  durationMs: number
}

export async function syncAllJobListings(options?: {
  city?: string | null
}): Promise<CombinedJobListingSyncResult> {
  const started = Date.now()

  // Kariyer first — no İŞKUR login, usually faster path to fill the board.
  const kariyer = await syncKariyerJobListings(options)
  const iskur = await syncIskurJobListings(options)

  const failedCities = [
    ...new Set([...kariyer.failedCities, ...iskur.failedCities]),
  ]

  return {
    iskur,
    kariyer,
    scraped: kariyer.scraped + iskur.scraped,
    upserted: kariyer.upserted + iskur.upserted,
    failedCities,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  }
}
