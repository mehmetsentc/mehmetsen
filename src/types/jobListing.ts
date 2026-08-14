/**
 * City job listings — İŞKUR + Kariyer.net via Apify scrapers.
 * Always attribute the real source. Never invent fake jobs when sync is empty.
 */

export type JobListingSource = 'iskur' | 'kariyer' | 'manual'

export type JobListingKind = 'normal' | 'iup' | 'typ' | 'other'

export interface JobListing {
  id: string
  /** Province slug matching city tenant (e.g. canakkale). */
  citySlug: string
  cityName: string
  title: string
  employer: string | null
  employerType: string | null
  district: string | null
  locationLabel: string | null
  workType: string | null
  openPositions: number | null
  deadlineAt: string | null
  publishedAt: string | null
  applyUrl: string | null
  source: JobListingSource
  sourceId: string
  listingKind: JobListingKind
  isActive: boolean
  fetchedAt: string
  syncedAt: string
  /** Raw scraper payload for debugging (trimmed). */
  raw?: Record<string, unknown>
}

export interface JobListingSyncResult {
  cities: string[]
  scraped: number
  upserted: number
  skipped: number
  markedInactive: number
  skippedReason?: string
  failedCities: string[]
  completedAt: string
  durationMs: number
}
