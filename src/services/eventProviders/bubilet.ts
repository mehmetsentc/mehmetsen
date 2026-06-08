import type { EventProvider, EventProviderParams } from './types'
import {
  fetchText,
  findEventNode,
  isDisabledByEnv,
  loadHtml,
  mapWithConcurrency,
  normalizeEvent,
  providerLog,
  readEnv,
  stripHtml,
  toNumber,
} from './shared'
import type { NaEvent } from '@/types/event'

/**
 * Bubilet — LIVE adapter.
 *
 * Bubilet has no public API. Its city pages (`/<city>`) are server-rendered and
 * list events as cards linking to `/<city>/etkinlik/<slug>`. Each *detail* page
 * embeds a schema.org `Event` JSON-LD block with start/end dates, venue, geo
 * coordinates, image and ticket URL — the cleanest thing to parse.
 *
 * Strategy:
 *   1. GET the city listing, collect event detail links (capped).
 *   2. Fetch those detail pages with bounded concurrency.
 *   3. Parse the `Event` JSON-LD from each and normalize.
 *
 * Enabled by default (no credentials). Set `BUBILET_DISABLED=true` to disable,
 * `BUBILET_BASE_URL` to override the host, and `BUBILET_MAX_EVENTS` to change
 * the per-city cap. Reliability/ToS caveat: best-effort scraping of an HTML
 * site; it fails soft (returns []).
 */

const DEFAULT_BASE_URL = 'https://www.bubilet.com.tr'
const DEFAULT_MAX_EVENTS = 24
const DEFAULT_CITY = 'istanbul'
const DETAIL_CONCURRENCY = 5

interface JsonLdPlace {
  name?: string
  address?: { streetAddress?: string; addressLocality?: string }
  geo?: { latitude?: number | string; longitude?: number | string }
}

function collectEventLinks(html: string, citySlug: string, max: number): string[] {
  const $ = loadHtml(html)
  const prefix = `/${citySlug}/etkinlik/`
  const seen = new Set<string>()

  $(`a[href^="${prefix}"]`).each((_, el) => {
    const href = $(el).attr('href')
    if (href && href.startsWith(prefix)) seen.add(href.split('?')[0])
  })

  return [...seen].slice(0, max)
}

function parseDetail(
  html: string,
  pageUrl: string,
  citySlug: string
): NaEvent | null {
  const node = findEventNode(html)
  if (!node) return null

  const location = node.location as JsonLdPlace | undefined
  const image = node.image
  const coverImageUrl = Array.isArray(image)
    ? (image[0] as string)
    : typeof image === 'string'
      ? image
      : null

  const offers = node.offers as { url?: string } | undefined

  return normalizeEvent({
    providerId: 'bubilet',
    providerLabel: 'Bubilet',
    externalId: pageUrl,
    title: typeof node.name === 'string' ? node.name : '',
    description: stripHtml(typeof node.description === 'string' ? node.description : ''),
    category: `${typeof node.name === 'string' ? node.name : ''} ${
      Array.isArray(node.keywords) ? node.keywords.join(' ') : (node.keywords ?? '')
    }`,
    city: location?.address?.addressLocality ?? null,
    citySlug,
    venue: location?.name ?? null,
    address: location?.address?.streetAddress ?? null,
    startsAt: node.startDate,
    endsAt: node.endDate ?? null,
    coverImageUrl,
    ticketUrl: offers?.url ?? pageUrl,
    lat: toNumber(location?.geo?.latitude),
    lng: toNumber(location?.geo?.longitude),
  })
}

export const bubiletProvider: EventProvider = {
  id: 'bubilet',
  label: 'Bubilet',

  isEnabled() {
    return !isDisabledByEnv('BUBILET_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    const baseUrl = (readEnv('BUBILET_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const maxEvents = toNumber(readEnv('BUBILET_MAX_EVENTS')) ?? DEFAULT_MAX_EVENTS
    const citySlug = params.citySlug || DEFAULT_CITY

    try {
      providerLog('bubilet', 'fetching city listing', { citySlug })
      const listingHtml = await fetchText(`${baseUrl}/${citySlug}`)
      const links = collectEventLinks(listingHtml, citySlug, maxEvents)

      if (links.length === 0) {
        providerLog('bubilet', `no event links for ${citySlug} — returning []`)
        return []
      }

      const events = await mapWithConcurrency(links, DETAIL_CONCURRENCY, async (href) => {
        const pageUrl = `${baseUrl}${href}`
        try {
          const detailHtml = await fetchText(pageUrl)
          return parseDetail(detailHtml, pageUrl, citySlug)
        } catch {
          // One bad detail page shouldn't sink the rest.
          return null
        }
      })

      const out = events.filter((e): e is NaEvent => e !== null)
      providerLog('bubilet', `normalized ${out.length}/${links.length} event(s)`)
      return out
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      providerLog('bubilet', `fetch failed: ${message} — returning []`)
      return []
    }
  },
}
