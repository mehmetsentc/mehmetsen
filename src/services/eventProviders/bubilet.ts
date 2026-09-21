import type { EventProvider, EventProviderParams, ProviderFetchResult } from './types'
import {
  fetchDocument,
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
import { extractDistrictSlugFromText } from '@/constants/cities'
import { createDiagnostics, finalizeDiagnostics, isOccurrenceFirstRequested } from './diagnostics'
import { looksLikeChallengePage, looksLikeRateLimit } from './occurrence'
import { isEventSpecificTicketUrl } from './ticketUrl'
import type { NaEvent } from '@/types/event'

/**
 * Bubilet — repaired adapter (occurrence = JSON-LD subEvent / seans).
 *
 * City listing is one large HTML document (no page= pagination observed).
 * `BUBILET_MAX_EVENTS` is a detail-fetch budget, not an inventory claim.
 * Cloudflare challenges are reported as BLOCKED, not silent [].
 */

const DEFAULT_BASE_URL = 'https://www.bubilet.com.tr'
const DEFAULT_MAX_EVENTS = 24
const DEFAULT_CITY = 'istanbul'
const DETAIL_CONCURRENCY = 4

interface JsonLdPlace {
  name?: string
  address?: { streetAddress?: string; addressLocality?: string }
  geo?: { latitude?: number | string; longitude?: number | string }
}

export interface BubiletSessionCandidate {
  eventHref: string
  seansHref?: string
  seansId?: string
}

export function collectBubiletEventLinks(html: string, citySlug: string): string[] {
  const $ = loadHtml(html)
  const prefix = `/${citySlug}/etkinlik/`
  const seen = new Set<string>()
  $(`a[href^="${prefix}"]`).each((_, el) => {
    const href = $(el).attr('href')
    if (!href || !href.startsWith(prefix)) return
    const clean = href.split('?')[0]
    if (clean.includes('/seans/')) return
    seen.add(clean)
  })
  return [...seen]
}

export function collectBubiletSeansLinks(html: string, citySlug?: string): string[] {
  const $ = loadHtml(html)
  const seen = new Set<string>()
  $('a[href*="/seans/"]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').split('?')[0]
    if (!/\/etkinlik\/[^/]+\/seans\/\d+/.test(href)) return
    if (citySlug && !href.includes(`/${citySlug}/etkinlik/`)) return
    seen.add(href)
  })
  return [...seen]
}

export function bubiletListingKeyFromHref(href: string): string {
  const path = href.split('?')[0]
  const match = path.match(/\/[a-z0-9-]+\/etkinlik\/[^/]+/i)
  return (match?.[0] ?? path).replace(/\/+$/, '')
}

export function bubiletListingKeyFromTicketUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const path = new URL(url).pathname.replace(/\/seans\/\d+.*$/i, '')
    return bubiletListingKeyFromHref(path)
  } catch {
    return null
  }
}

export function pickBubiletDetailHrefs(
  listingHrefs: string[],
  knownListingKeys: Iterable<string>,
  maxDetails: number
): { fetch: string[]; skippedKnown: number; newCount: number } {
  const known = new Set(
    [...knownListingKeys].map((key) => bubiletListingKeyFromHref(key))
  )
  const fresh: string[] = []
  let skippedKnown = 0
  for (const href of listingHrefs) {
    if (known.has(bubiletListingKeyFromHref(href))) skippedKnown += 1
    else fresh.push(href)
  }
  return {
    fetch: fresh.slice(0, Math.max(0, maxDetails)),
    skippedKnown,
    newCount: fresh.length,
  }
}

export function parseBubiletSeansId(href: string): string | null {
  const match = href.match(/\/seans\/(\d+)/)
  return match?.[1] ?? null
}

function asPlace(location: unknown): JsonLdPlace | undefined {
  if (!location || typeof location !== 'object') return undefined
  return location as JsonLdPlace
}

function imageUrl(node: Record<string, unknown>): string | null {
  const image = node.image
  if (Array.isArray(image)) return typeof image[0] === 'string' ? image[0] : null
  return typeof image === 'string' ? image : null
}

export function extractBubiletSubEvents(node: Record<string, unknown>): Record<string, unknown>[] {
  const raw = node.subEvent
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : [raw]
  return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
}

export function mapBubiletOccurrence(input: {
  node: Record<string, unknown>
  pageUrl: string
  citySlug: string
  seansHref?: string
  seansId?: string
}): NaEvent | null {
  const location = asPlace(input.node.location)
  const address = location?.address?.streetAddress ?? ''
  const ticketUrl =
    (input.seansHref && isEventSpecificTicketUrl(input.seansHref) ? input.seansHref : null) ||
    (typeof (input.node.offers as { url?: string } | undefined)?.url === 'string'
      ? (input.node.offers as { url?: string }).url
      : null) ||
    input.pageUrl

  const externalId = input.seansId
    ? `seans:${input.seansId}`
    : `${input.pageUrl}|${String(input.node.startDate ?? '')}`

  return normalizeEvent({
    providerId: 'bubilet',
    providerLabel: 'Bubilet',
    externalId,
    title: typeof input.node.name === 'string' ? input.node.name : '',
    description: stripHtml(typeof input.node.description === 'string' ? input.node.description : ''),
    category: `${typeof input.node.name === 'string' ? input.node.name : ''} ${
      Array.isArray(input.node.keywords) ? input.node.keywords.join(' ') : (input.node.keywords ?? '')
    }`,
    city: location?.address?.addressLocality ?? null,
    citySlug: input.citySlug,
    districtSlug: address ? extractDistrictSlugFromText(address) : null,
    venue: location?.name ?? null,
    address: address || null,
    startsAt: input.node.startDate,
    endsAt: input.node.endDate ?? null,
    coverImageUrl: imageUrl(input.node),
    ticketUrl,
    lat: toNumber(location?.geo?.latitude),
    lng: toNumber(location?.geo?.longitude),
  })
}

export function parseBubiletDetail(
  html: string,
  pageUrl: string,
  citySlug: string
): { events: NaEvent[]; containers: number } {
  const node = findEventNode(html)
  if (!node) return { events: [], containers: 0 }

  const seansHrefs = collectBubiletSeansLinks(html, citySlug).map((href) =>
    href.startsWith('http') ? href : new URL(href, pageUrl).toString()
  )
  const subEvents = extractBubiletSubEvents(node)
  const sessions = subEvents.length > 0 ? subEvents : [node]
  const isContainer = subEvents.length > 1

  const events = sessions
    .map((session, index) =>
      mapBubiletOccurrence({
        node: {
          ...node,
          ...session,
          image: session.image ?? node.image,
          location: session.location ?? node.location,
          name: session.name ?? node.name,
        },
        pageUrl,
        citySlug,
        seansHref: seansHrefs[index],
        seansId: seansHrefs[index] ? parseBubiletSeansId(seansHrefs[index]) ?? undefined : undefined,
      })
    )
    .filter((e): e is NaEvent => e !== null)

  return { events, containers: isContainer ? 1 : 0 }
}

function parseDetailLegacy(html: string, pageUrl: string, citySlug: string): NaEvent | null {
  const parsed = parseBubiletDetail(html, pageUrl, citySlug)
  return parsed.events[0] ?? null
}

async function fetchLegacy(params: EventProviderParams): Promise<NaEvent[]> {
  const baseUrl = (readEnv('BUBILET_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const maxEvents = toNumber(readEnv('BUBILET_MAX_EVENTS')) ?? DEFAULT_MAX_EVENTS
  const citySlug = params.citySlug || DEFAULT_CITY

  try {
    providerLog('bubilet', 'fetching city listing', { citySlug })
    const listing = await fetchDocument(`${baseUrl}/${citySlug}`)
    if (!listing.ok) return []
    const links = collectBubiletEventLinks(listing.text, citySlug).slice(0, maxEvents)
    if (links.length === 0) return []

    const events = await mapWithConcurrency(links, DETAIL_CONCURRENCY, async (href) => {
      const pageUrl = `${baseUrl}${href}`
      try {
        const detail = await fetchDocument(pageUrl)
        if (!detail.ok) return null
        return parseDetailLegacy(detail.text, pageUrl, citySlug)
      } catch {
        return null
      }
    })
    return events.filter((e): e is NaEvent => e !== null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    providerLog('bubilet', `fetch failed: ${message} — returning []`)
    return []
  }
}

export const bubiletProvider: EventProvider = {
  id: 'bubilet',
  label: 'Bubilet',

  isEnabled() {
    return !isDisabledByEnv('BUBILET_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    if (isOccurrenceFirstRequested(params)) {
      return (await bubiletProvider.fetchWithDiagnostics!(params)).events
    }
    return fetchLegacy(params)
  },

  async fetchWithDiagnostics(params: EventProviderParams): Promise<ProviderFetchResult> {
    const diagnostics = createDiagnostics({ status: 'EMPTY' })
    const baseUrl = (readEnv('BUBILET_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const maxDetails =
      params.maxDetails ?? toNumber(readEnv('BUBILET_MAX_EVENTS')) ?? DEFAULT_MAX_EVENTS
    const citySlug = params.citySlug || DEFAULT_CITY
    const events: NaEvent[] = []

    try {
      const listing = await fetchDocument(`${baseUrl}/${citySlug}`)
      diagnostics.pagesFetched += 1

      if (looksLikeRateLimit(listing.status)) {
        diagnostics.status = 'RATE_LIMITED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }
      if (looksLikeChallengePage(listing.text, listing.status) || listing.status === 403) {
        diagnostics.blocked = true
        diagnostics.status = 'BLOCKED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }
      if (!listing.ok) {
        diagnostics.status = 'FETCH_FAILED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }

      const links = collectBubiletEventLinks(listing.text, citySlug)
      diagnostics.discovered = links.length
      const selected = pickBubiletDetailHrefs(links, params.knownListingKeys ?? [], maxDetails)
      const budgeted = selected.fetch
      if (selected.newCount > budgeted.length) diagnostics.status = 'PARTIAL'

      const details = await mapWithConcurrency(budgeted, DETAIL_CONCURRENCY, async (href) => {
        const pageUrl = href.startsWith('http') ? href : `${baseUrl}${href}`
        const detail = await fetchDocument(pageUrl)
        diagnostics.detailFetches += 1
        if (looksLikeChallengePage(detail.text, detail.status)) {
          diagnostics.blocked = true
          return [] as NaEvent[]
        }
        if (!detail.ok) {
          diagnostics.invalid += 1
          return [] as NaEvent[]
        }
        const parsed = parseBubiletDetail(detail.text, pageUrl, citySlug)
        diagnostics.containers += parsed.containers
        return parsed.events
      })

      for (const batch of details) events.push(...batch)
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
