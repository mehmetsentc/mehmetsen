import type { EventProvider, EventProviderParams, ProviderFetchResult } from './types'
import {
  fetchDocument,
  isDisabledByEnv,
  normalizeEvent,
  providerLog,
  readEnv,
} from './shared'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { createDiagnostics, finalizeDiagnostics, isOccurrenceFirstRequested } from './diagnostics'
import { preferEventPoster } from './imageQuality'
import { looksLikeChallengePage, looksLikeRateLimit } from './occurrence'
import { isEventSpecificTicketUrl } from './ticketUrl'
import type { NaEvent } from '@/types/event'

/**
 * Ticketmaster Discovery API v2 — official adapter.
 *
 * Ticketmaster owns Biletix (Ticketmaster Türkiye), so this API surfaces the
 * same events as Biletix but via a documented, IP-unrestricted REST endpoint.
 *
 * Occurrence-first path paginates the official API. Legacy fetchEvents stays
 * one page so production cron behavior is unchanged until EVENTS_OCCURRENCE_V1.
 */

const DEFAULT_API_URL = 'https://app.ticketmaster.com/discovery/v2/events.json'
const DEFAULT_MAX_EVENTS = 100
const DEFAULT_MAX_PAGES = 5
const PAGE_SIZE = 200

function getTMCityName(citySlug: string): string | null {
  const province = TURKISH_PROVINCES.find((p) => p.slug === citySlug)
  return province?.name ?? null
}

export interface TMImage {
  url?: string
  width?: number
  height?: number
  ratio?: string
}

export interface TMVenue {
  name?: string
  city?: { name?: string }
  country?: { name?: string; countryCode?: string }
  location?: { latitude?: string; longitude?: string }
  address?: { line1?: string }
}

export interface TMClassification {
  segment?: { name?: string }
  genre?: { name?: string }
  subGenre?: { name?: string }
}

export interface TMEvent {
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

export interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { totalElements?: number; totalPages?: number; size?: number; number?: number }
}

export function pickTicketmasterImage(images: TMImage[] | undefined): string | null {
  if (!images?.length) return null
  const scored = images
    .filter((img) => img.url)
    .map((img) => {
      const generic = /ticketm\.net\/dam\/c\//i.test(img.url ?? '')
      const ratioBonus = img.ratio === '16_9' ? 2 : 0
      const sizeScore = -Math.abs((img.width ?? 0) - 640)
      return { url: img.url as string, score: (generic ? -50 : 20) + ratioBonus + sizeScore / 100 }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

export function mapTicketmasterEvent(ev: TMEvent, cityFallback?: string | null): NaEvent | null {
  if (!ev.id || !ev.name) return null
  const venue = ev._embedded?.venues?.[0]
  const city = venue?.city?.name ?? cityFallback ?? null
  const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : undefined
  const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : undefined
  const ticketUrl = ev.url && isEventSpecificTicketUrl(ev.url) ? ev.url : ev.url ?? null

  return normalizeEvent({
    providerId: 'ticketmaster',
    providerLabel: 'Ticketmaster',
    externalId: ev.id,
    title: ev.name,
    description: ev.info ?? ev.description ?? null,
    category: buildCategory(ev),
    city,
    venue: venue?.name ?? null,
    address: venue?.address?.line1 ?? null,
    startsAt:
      ev.dates?.start?.dateTime ??
      `${ev.dates?.start?.localDate}T${ev.dates?.start?.localTime ?? '00:00:00'}`,
    endsAt: ev.dates?.end?.dateTime ?? null,
    coverImageUrl: pickTicketmasterImage(ev.images),
    ticketUrl,
    lat,
    lng,
  })
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

function buildSearchParams(apiKey: string, cityName: string | null, page: number, size: number): URLSearchParams {
  const searchParams = new URLSearchParams({
    apikey: apiKey,
    countryCode: 'TR',
    locale: 'tr-TR,tr,*',
    size: String(size),
    page: String(page),
    sort: 'date,asc',
    startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  })
  if (cityName) searchParams.set('city', cityName)
  return searchParams
}

export function applyPreferredPoster(event: NaEvent, poster: string | null | undefined): NaEvent {
  return { ...event, coverImageUrl: preferEventPoster(event.coverImageUrl, poster) }
}

async function fetchLegacy(params: EventProviderParams): Promise<NaEvent[]> {
  const apiKey = readEnv('TICKETMASTER_API_KEY')
  if (!apiKey) return []

  const baseUrl = readEnv('TICKETMASTER_API_URL') ?? DEFAULT_API_URL
  const maxEvents = Number(readEnv('TICKETMASTER_MAX_EVENTS') ?? DEFAULT_MAX_EVENTS)
  const cityName = params.citySlug ? getTMCityName(params.citySlug) : null
  const searchParams = buildSearchParams(apiKey, cityName, 0, Math.min(maxEvents, PAGE_SIZE))
  const url = `${baseUrl}?${searchParams.toString()}`

  try {
    providerLog('ticketmaster', 'querying Discovery API', { citySlug: params.citySlug, cityName })
    const doc = await fetchDocument(url)
    if (!doc.ok) return []
    const data = JSON.parse(doc.text) as TMResponse
    const rawEvents = data._embedded?.events ?? []
    return rawEvents
      .map((ev) => mapTicketmasterEvent(ev, cityName))
      .filter((e): e is NaEvent => e !== null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    providerLog('ticketmaster', `fetch failed: ${message} — returning []`)
    return []
  }
}

export const ticketmasterProvider: EventProvider = {
  id: 'ticketmaster',
  label: 'Ticketmaster',

  isEnabled() {
    if (isDisabledByEnv('TICKETMASTER_DISABLED')) return false
    return !!readEnv('TICKETMASTER_API_KEY')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    if (isOccurrenceFirstRequested(params)) {
      return (await ticketmasterProvider.fetchWithDiagnostics!(params)).events
    }
    return fetchLegacy(params)
  },

  async fetchWithDiagnostics(params: EventProviderParams): Promise<ProviderFetchResult> {
    const diagnostics = createDiagnostics({ status: 'EMPTY' })
    const apiKey = readEnv('TICKETMASTER_API_KEY')
    if (!apiKey) {
      diagnostics.status = 'EMPTY'
      diagnostics.message = 'TICKETMASTER_API_KEY not configured'
      return { events: [], diagnostics }
    }

    const baseUrl = readEnv('TICKETMASTER_API_URL') ?? DEFAULT_API_URL
    const maxEvents = Number(readEnv('TICKETMASTER_MAX_EVENTS') ?? DEFAULT_MAX_EVENTS)
    const maxPages = Math.min(params.maxPages ?? DEFAULT_MAX_PAGES, 8)
    const cityName = params.citySlug ? getTMCityName(params.citySlug) : null
    const seen = new Set<string>()
    const events: NaEvent[] = []

    try {
      for (let page = 0; page < maxPages && events.length < maxEvents; page += 1) {
        const remaining = maxEvents - events.length
        const searchParams = buildSearchParams(apiKey, cityName, page, Math.min(PAGE_SIZE, remaining, 200))
        const url = `${baseUrl}?${searchParams.toString()}`
        const doc = await fetchDocument(url)
        diagnostics.pagesFetched += 1

        if (looksLikeRateLimit(doc.status)) {
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'RATE_LIMITED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }
        if (looksLikeChallengePage(doc.text, doc.status) || doc.status === 401 || doc.status === 403) {
          diagnostics.blocked = true
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'BLOCKED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }
        if (!doc.ok) {
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'FETCH_FAILED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }

        const data = JSON.parse(doc.text) as TMResponse
        const rawEvents = data._embedded?.events ?? []
        diagnostics.discovered += rawEvents.length

        for (const ev of rawEvents) {
          if (!ev.id || seen.has(ev.id)) continue
          seen.add(ev.id)
          const mapped = mapTicketmasterEvent(ev, cityName)
          if (!mapped) {
            diagnostics.invalid += 1
            continue
          }
          events.push(mapped)
          if (events.length >= maxEvents) break
        }

        const totalPages = data.page?.totalPages ?? 1
        if (page + 1 >= totalPages || rawEvents.length === 0) break
      }

      diagnostics.occurrences = events.length
      return { events, diagnostics: finalizeDiagnostics(diagnostics, events) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      diagnostics.status = events.length > 0 ? 'PARTIAL' : 'FETCH_FAILED'
      diagnostics.message = message
      diagnostics.occurrences = events.length
      return { events, diagnostics }
    }
  },
}
