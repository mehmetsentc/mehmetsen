import { eventProviders, getEnabledProviders } from '@/services/eventProviders'
import { providerLog } from '@/services/eventProviders/shared'
import { dedupeEvents } from '@/lib/eventDedupe'
import type { NaEvent } from '@/types/event'

/**
 * Server-side aggregation of external ticket-platform events.
 *
 * Runs every *enabled* provider in parallel (`Promise.allSettled`), merges the
 * results, and dedupes across providers. It is robust to any single provider
 * failing or timing out — a rejected/empty provider simply contributes nothing.
 *
 * This module is server-only (providers read secret env vars). It is invoked
 * from the `/api/events/aggregate` route, never from client code.
 */

export interface AggregateEventsParams {
  citySlug?: string
  category?: string
}

export interface AggregateEventsResult {
  events: NaEvent[]
  /** ids of providers that actually ran (were enabled). */
  providers: string[]
  /** ids of providers that threw/failed during this aggregation. */
  failedProviders: string[]
  /** True when this result was served from the in-memory cache. */
  cached?: boolean
}

/**
 * Short-lived in-memory cache so we don't re-scrape every external platform on
 * every page load (which would be slow and could get us rate-limited/blocked).
 *
 * Caveat: this lives in the module scope of a single server instance. On
 * serverless/multi-instance deployments each instance keeps its own cache and
 * cold starts begin empty — that's acceptable for this best-effort feature. For
 * a shared cache, back this with Redis/Firestore later.
 */
const CACHE_TTL_MS = 20 * 60 * 1000 // 20 minutes
const cache = new Map<string, { expiresAt: number; result: AggregateEventsResult }>()

function cacheKey(params: AggregateEventsParams): string {
  return `${params.citySlug ?? '*'}|${params.category ?? '*'}`
}

export const eventAggregatorService = {
  /**
   * Aggregates events from all enabled providers. Always resolves; never throws.
   */
  async aggregateEvents(
    params: AggregateEventsParams = {}
  ): Promise<AggregateEventsResult> {
    const key = cacheKey(params)
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      providerLog('aggregator', `cache hit for "${key}" (${hit.result.events.length} events)`)
      return { ...hit.result, cached: true }
    }

    const enabled = getEnabledProviders()

    if (enabled.length === 0) {
      providerLog(
        'aggregator',
        `no providers enabled (${eventProviders.length} registered) — returning []`
      )
      return { events: [], providers: [], failedProviders: [] }
    }

    const settled = await Promise.allSettled(
      enabled.map((provider) =>
        provider.fetchEvents({
          citySlug: params.citySlug,
          category: params.category,
        })
      )
    )

    const merged: NaEvent[] = []
    const failedProviders: string[] = []

    settled.forEach((outcome, i) => {
      const provider = enabled[i]
      if (outcome.status === 'fulfilled') {
        merged.push(...outcome.value)
      } else {
        // Adapters are designed not to throw, but guard anyway.
        failedProviders.push(provider.id)
        providerLog('aggregator', `provider ${provider.id} rejected`, outcome.reason)
      }
    })

    const events = dedupeEvents(merged)

    providerLog(
      'aggregator',
      `aggregated ${events.length} unique event(s) from ${enabled.length} provider(s)`
    )

    const result: AggregateEventsResult = {
      events,
      providers: enabled.map((p) => p.id),
      failedProviders,
      cached: false,
    }

    // Only cache non-empty results so a transient total failure isn't pinned
    // for the full TTL.
    if (events.length > 0) {
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result })
    }

    return result
  },
}
