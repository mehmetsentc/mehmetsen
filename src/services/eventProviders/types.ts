import type { NaEvent } from '@/types/event'

/** Filters passed down to each provider when aggregating. */
export interface EventProviderParams {
  /** Normalized city slug to filter by, e.g. "istanbul". */
  citySlug?: string
  /** Event category id (concert|festival|…) to filter by. */
  category?: string
}

/**
 * Pluggable adapter for an external Turkish ticket platform (Biletix, Biletino,
 * Bubilet, …).
 *
 * The contract is intentionally tiny so adapters stay easy to add:
 *   - `isEnabled()` returns true only when the provider is configured via env
 *     (base URL / API key). When false the aggregator skips it.
 *   - `fetchEvents()` calls the provider server-side and normalizes the payload
 *     into our `NaEvent` shape. It MUST resolve (never throw) — return `[]` on
 *     any error so one flaky provider can't take the whole aggregate down.
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
}
