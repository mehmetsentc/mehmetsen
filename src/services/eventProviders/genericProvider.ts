import type { EventProvider, EventProviderParams } from './types'
import {
  fetchJson,
  normalizeEvent,
  providerLog,
  readEnv,
  type NormalizeInput,
} from './shared'
import type { NaEvent } from '@/types/event'

/**
 * Reusable factory for a ticket-platform adapter.
 *
 * Real Turkish ticket platforms (Biletix/Ticketmaster TR, Biletino, Bubilet,
 * Passo, Bugece, …) generally do NOT expose an open public API — most require
 * partner/B2B access and scraping their HTML is fragile and ToS-sensitive. So
 * every adapter is *configuration-driven*:
 *
 *   - When the provider's `API_URL` env is set, we call it server-side and
 *     normalize the response into `NaEvent[]`.
 *   - When it is NOT set, `isEnabled()` is false and the aggregator skips it.
 *     If `fetchEvents` is somehow called it returns `[]` (a documented no-op),
 *     so the app stays fully functional with zero credentials.
 *
 * To wire a real provider: implement `mapResponse` for that provider's payload
 * shape and (if needed) `buildUrl`/`buildHeaders`, then set its env vars. The
 * named adapters (biletix/biletino/bubilet) are thin wrappers over this.
 */
export interface GenericProviderConfig {
  id: string
  label: string
  /** Env var holding the provider base URL/endpoint. */
  urlEnv: string
  /** Optional env var holding an API key/token. */
  keyEnv?: string
  /**
   * Builds the request URL from the base URL + filters. Default appends
   * `citySlug`/`category` as query params; override per provider as needed.
   */
  buildUrl?: (baseUrl: string, params: EventProviderParams) => string
  /** Builds request headers (e.g. Authorization). */
  buildHeaders?: (apiKey: string | undefined) => Record<string, string>
  /**
   * Maps the provider's raw JSON response to partial normalize inputs. Return
   * one entry per event; `normalizeEvent` fills/validates the rest. Throwing or
   * returning a non-array is treated as "no events".
   */
  mapResponse?: (
    raw: unknown,
    params: EventProviderParams
  ) => Array<Omit<NormalizeInput, 'providerId' | 'providerLabel'>>
}

function defaultBuildUrl(baseUrl: string, params: EventProviderParams): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return baseUrl
  }
  if (params.citySlug) url.searchParams.set('city', params.citySlug)
  if (params.category) url.searchParams.set('category', params.category)
  return url.toString()
}

function defaultBuildHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function createGenericProvider(config: GenericProviderConfig): EventProvider {
  const buildUrl = config.buildUrl ?? defaultBuildUrl
  const buildHeaders = config.buildHeaders ?? defaultBuildHeaders

  return {
    id: config.id,
    label: config.label,

    isEnabled() {
      return readEnv(config.urlEnv) !== undefined
    },

    async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
      const baseUrl = readEnv(config.urlEnv)
      if (!baseUrl) {
        // Documented no-op: not configured → nothing to aggregate from here.
        providerLog(config.id, `disabled (${config.urlEnv} not set) — returning []`)
        return []
      }

      const apiKey = config.keyEnv ? readEnv(config.keyEnv) : undefined

      try {
        const url = buildUrl(baseUrl, params)
        providerLog(config.id, 'fetching', { url })
        const raw = await fetchJson<unknown>(url, { headers: buildHeaders(apiKey) })

        const mapped = config.mapResponse ? config.mapResponse(raw, params) : []
        if (!Array.isArray(mapped)) return []

        const events = mapped
          .map((entry) =>
            normalizeEvent({
              ...entry,
              providerId: config.id,
              providerLabel: config.label,
            })
          )
          .filter((e): e is NaEvent => e !== null)

        providerLog(config.id, `normalized ${events.length} event(s)`)
        return events
      } catch (error) {
        // Never throw — a failing provider must not break the aggregate.
        const message = error instanceof Error ? error.message : 'unknown error'
        providerLog(config.id, `fetch failed: ${message} — returning []`)
        return []
      }
    },
  }
}

/**
 * A spare generic provider you can point at any JSON endpoint that already
 * returns objects close to our `NaEvent` shape (handy for testing or a custom
 * in-house events API). Configure with `EVENTS_GENERIC_API_URL` (+ optional
 * `EVENTS_GENERIC_API_KEY`). Disabled by default.
 */
export const genericProvider = createGenericProvider({
  id: 'generic',
  label: 'Etkinlik Kaynağı',
  urlEnv: 'EVENTS_GENERIC_API_URL',
  keyEnv: 'EVENTS_GENERIC_API_KEY',
  mapResponse: (raw) => {
    // Accept either a bare array or `{ events: [...] }` / `{ data: [...] }`.
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { events?: unknown })?.events)
        ? (raw as { events: unknown[] }).events
        : Array.isArray((raw as { data?: unknown })?.data)
          ? (raw as { data: unknown[] }).data
          : []

    return list
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        externalId: (item.id as string) ?? null,
        title: (item.title as string) ?? '',
        description: (item.description as string) ?? null,
        category: (item.category as string) ?? null,
        city: (item.city as string) ?? null,
        citySlug: (item.citySlug as string) ?? null,
        venue: (item.venue as string) ?? null,
        address: (item.address as string) ?? null,
        startsAt: item.startsAt ?? item.startDate ?? item.date,
        endsAt: item.endsAt ?? item.endDate ?? null,
        coverImageUrl: (item.coverImageUrl as string) ?? (item.image as string) ?? null,
        ticketUrl: (item.ticketUrl as string) ?? (item.url as string) ?? null,
        lat: item.lat ?? (item.latitude as unknown),
        lng: item.lng ?? (item.longitude as unknown),
      }))
  },
})
