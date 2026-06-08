import type { NaEvent } from '@/types/event'

/**
 * Client helper for `GET /api/events/aggregate`. Kept separate from the
 * server-only aggregator/provider modules so no secret-bearing code is bundled
 * into the client. Always resolves; returns an empty result on any failure so
 * the events page still renders from Firestore alone.
 */

export interface AggregatedEventsResponse {
  events: NaEvent[]
  providers: string[]
  failedProviders: string[]
}

const EMPTY: AggregatedEventsResponse = {
  events: [],
  providers: [],
  failedProviders: [],
}

export async function fetchAggregatedEvents(
  params: { citySlug?: string | null; category?: string | null } = {},
  signal?: AbortSignal
): Promise<AggregatedEventsResponse> {
  try {
    const search = new URLSearchParams()
    if (params.citySlug) search.set('citySlug', params.citySlug)
    if (params.category) search.set('category', params.category)
    const qs = search.toString()

    const res = await fetch(`/api/events/aggregate${qs ? `?${qs}` : ''}`, {
      signal,
      cache: 'no-store',
    })
    if (!res.ok) return EMPTY

    const data = (await res.json()) as Partial<AggregatedEventsResponse>
    return {
      events: Array.isArray(data.events) ? data.events : [],
      providers: Array.isArray(data.providers) ? data.providers : [],
      failedProviders: Array.isArray(data.failedProviders) ? data.failedProviders : [],
    }
  } catch {
    // AbortError or network failure → degrade to Firestore-only.
    return EMPTY
  }
}
