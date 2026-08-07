import type { EventProvider, EventProviderParams } from './types'
import {
  fetchJson,
  isDisabledByEnv,
  normalizeEvent,
  providerLog,
  readEnv,
} from './shared'
import { TURKISH_PROVINCES } from '@/constants/cities'
import type { NaEvent } from '@/types/event'

/**
 * Ticketmaster Discovery API v2 — official adapter.
 *
 * Ticketmaster owns Biletix (Ticketmaster Türkiye), so this API surfaces the
 * same events as Biletix but via a documented, IP-unrestricted REST endpoint.
 *
 * Sign up free at https://developer.ticketmaster.com → "Get API Key"
 * Free tier: 5 000 requests/day, 200 per second.
 *
 * Required env var: TICKETMASTER_API_KEY
 * Optional:
 *   TICKETMASTER_API_URL  — override base URL (default: official endpoint)
 *   TICKETMASTER_MAX_EVENTS — max events per city (default: 100, API max: 200)
 *   TICKETMASTER_DISABLED=true — disable this adapter
 */

const DEFAULT_API_URL = 'https://app.ticketmaster.com/discovery/v2/events.json'
const DEFAULT_MAX_EVENTS = 100

/** Maps our city slugs → city name string that Ticketmaster expects. */
function getTMCityName(citySlug: string): string | null {
  const province = TURKISH_PROVINCES.find((p) => p.slug === citySlug)
  return province?.name ?? null
}

interface TMImage {
  url?: string
  width?: number
  height?: number
}

interface TMVenue {
  name?: string
  city?: { name?: string }
  country?: { name?: string; countryCode?: string }
  location?: { latitude?: string; longitude?: string }
  address?: { line1?: string }
}

interface TMClassification {
  segment?: { name?: string }
  genre?: { name?: string }
  subGenre?: { name?: string }
}

interface TMEvent {
  id?: string
  name?: string
  url?: string
  images?: TMImage[]
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string }
    end?: { dateTime?: string }
  }
  _embedded?: { venues?: TMVenue[] }
  classifications?: TMClassification[]
  description?: string
  info?: string
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { totalElements?: number; totalPages?: number; size?: number; number?: number }
}

function pickBestImage(images: TMImage[] | undefined): string | null {
  if (!images?.length) return null
  // Prefer 16:9 ratio at ~640px wide (good card size)
  const sorted = [...images].sort((a, b) => {
    const aScore = Math.abs((a.width ?? 0) - 640)
    const bScore = Math.abs((b.width ?? 0) - 640)
    return aScore - bScore
  })
  return sorted[0]?.url ?? null
}

function buildCategory(event: TMEvent): string {
  const parts: string[] = []
  for (const cls of event.classifications ?? []) {
    if (cls.segment?.name) parts.push(cls.segment.name)
    if (cls.genre?.name) parts.push(cls.genre.name)
    if (cls.subGenre?.name) parts.push(cls.subGenre.name)
  }
  if (event.name) parts.push(event.name)
  return parts.join(' ')
}

export const ticketmasterProvider: EventProvider = {
  id: 'ticketmaster',
  label: 'Ticketmaster',

  isEnabled() {
    if (isDisabledByEnv('TICKETMASTER_DISABLED')) return false
    return !!readEnv('TICKETMASTER_API_KEY')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    const apiKey = readEnv('TICKETMASTER_API_KEY')
    if (!apiKey) return []

    const baseUrl = readEnv('TICKETMASTER_API_URL') ?? DEFAULT_API_URL
    const maxEvents = Number(readEnv('TICKETMASTER_MAX_EVENTS') ?? DEFAULT_MAX_EVENTS)

    // City filter
    const cityName = params.citySlug ? getTMCityName(params.citySlug) : null

    // Build query — only future events, sorted by date
    const searchParams = new URLSearchParams({
      apikey: apiKey,
      countryCode: 'TR',
      locale: 'tr-TR,tr,*',
      size: String(Math.min(maxEvents, 200)),
      sort: 'date,asc',
      startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    if (cityName) searchParams.set('city', cityName)

    const url = `${baseUrl}?${searchParams.toString()}`

    try {
      providerLog('ticketmaster', 'querying Discovery API', { citySlug: params.citySlug, cityName })

      const data = await fetchJson<TMResponse>(url)
      const rawEvents = data._embedded?.events ?? []

      providerLog('ticketmaster', `received ${rawEvents.length} event(s) (total: ${data.page?.totalElements ?? '?'})`)

      const events = rawEvents
        .map((ev): NaEvent | null => {
          if (!ev.id || !ev.name) return null

          const venue = ev._embedded?.venues?.[0]
          const city = venue?.city?.name ?? (params.citySlug ? cityName : null)
          const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : undefined
          const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : undefined

          return normalizeEvent({
            providerId: 'ticketmaster',
            providerLabel: 'Ticketmaster',
            externalId: ev.id,
            title: ev.name,
            description: ev.info ?? ev.description ?? null,
            category: buildCategory(ev),
            city: city ?? null,
            venue: venue?.name ?? null,
            address: venue?.address?.line1 ?? null,
            startsAt: ev.dates?.start?.dateTime ?? `${ev.dates?.start?.localDate}T${ev.dates?.start?.localTime ?? '00:00:00'}`,
            endsAt: ev.dates?.end?.dateTime ?? null,
            coverImageUrl: pickBestImage(ev.images),
            ticketUrl: ev.url ?? null,
            lat,
            lng,
          })
        })
        .filter((e): e is NaEvent => e !== null)

      providerLog('ticketmaster', `normalized ${events.length} event(s)`)
      return events
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      providerLog('ticketmaster', `fetch failed: ${message} — returning []`)
      return []
    }
  },
}
