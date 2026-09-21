import type { NaEvent } from '@/types/event'

/** Filters passed down to each provider when aggregating. */
export interface EventProviderParams {
  /** Normalized city slug to filter by, e.g. "istanbul". */
  citySlug?: string
  /** Event category id (concert|festival|…) to filter by. */
  category?: string
  /**
   * Occurrence-first path (dry-run / opt-in). Production cron stays on the
   * legacy `fetchEvents` path until `EVENTS_OCCURRENCE_V1=true`.
   */
  occurrenceFirst?: boolean
  /** Max listing/API pages (guard). */
  maxPages?: number
  /** Max detail-page fetches (request budget). */
  maxDetails?: number
  /**
   * Listing paths already represented by stored occurrences.
   * Used by Bubilet incremental cron to skip unchanged detail fetches.
   */
  knownListingKeys?: string[]
  /** Provider-native IDs already stored (BiletimGO numeric IDs, etc.). */
  knownExternalIds?: string[]
}

export type ProviderHealthStatus =
  | 'SUCCESS'
  | 'EMPTY'
  | 'PARTIAL'
  | 'FETCH_FAILED'
  | 'BLOCKED'
  | 'RATE_LIMITED'

export interface ProviderDiagnostics {
  status: ProviderHealthStatus
  message?: string
  discovered: number
  containers: number
  occurrences: number
  skippedContainers: number
  invalid: number
  pagesFetched: number
  detailFetches: number
  blocked: boolean
  /** Solr / listing total reported by the provider (Biletix numFound). */
  numFound?: number
  /** Audit-only Biletix splits. */
  rangeContainers?: number
  multiPerformanceContainers?: number
}

export interface ProviderFetchResult {
  events: NaEvent[]
  diagnostics: ProviderDiagnostics
}

/**
 * Pluggable adapter for an external Turkish ticket platform (Biletix, Biletino,
 * Bubilet, BiletimGO, …).
 *
 * The contract is intentionally tiny so adapters stay easy to add:
 *   - `isEnabled()` returns true only when the provider is configured via env
 *     (base URL / API key). When false the aggregator skips it.
 *   - `fetchEvents()` calls the provider server-side and normalizes the payload
 *     into our `NaEvent` shape. It MUST resolve (never throw) — return `[]` on
 *     any error so one flaky provider can't take the whole aggregate down.
 *   - `fetchWithDiagnostics()` is the occurrence-first path used by dry-run.
 *     Production cron does not call it until explicitly activated.
 *
 * IMPORTANT: adapters run server-side only (they read secret env vars and must
 * not be bundled into client code). They are invoked from
 * `eventAggregatorService` behind the `/api/events/aggregate` route.
 */
export interface EventProvider {
  /** Stable lowercase id, also stored on `NaEvent.source`, e.g. "biletix". */
  id: string
  /** Display name used for the source badge, e.g. "Biletix". */
  label: string
  /** True when the provider has the env config it needs to run. */
  isEnabled(): boolean
  /** Fetch + normalize events. Always resolves; returns `[]` on error. */
  fetchEvents(params: EventProviderParams): Promise<NaEvent[]>
  /** Occurrence-first fetch with EMPTY vs BLOCKED vs FAILURE diagnostics. */
  fetchWithDiagnostics?(params: EventProviderParams): Promise<ProviderFetchResult>
}
