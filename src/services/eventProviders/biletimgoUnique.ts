/**
 * Production BiletimGO unique-ID discovery.
 * Calendar pages repeat a national featured set; callers pass the verified
 * city subset (Istanbul + Ankara + Izmir) after equivalence proof.
 */
import { getProvincePlate } from '@/constants/provincePlates'
import { slugifyCity } from '@/lib/location'
import type { NaEvent } from '@/types/event'
import {
  collectBiletimgoListingCards,
  mapBiletimgoOccurrence,
  parseBiletimgoDetail,
  type BiletimgoListingCard,
} from './biletimgo'
import { looksLikeChallengePage, looksLikeRateLimit } from './occurrence'
import { fetchDocument } from './shared'
import type { ProviderDiagnostics, ProviderHealthStatus } from './types'

const BILETIMGO_BASE = 'https://www.biletimgo.com'
const UNIQUE_DETAIL_CAP = 200

function emptyDiag(status: ProviderHealthStatus, message?: string): ProviderDiagnostics {
  return {
    status,
    message,
    discovered: 0,
    containers: 0,
    occurrences: 0,
    skippedContainers: 0,
    invalid: 0,
    pagesFetched: 0,
    detailFetches: 0,
    blocked: false,
    rangeContainers: 0,
    multiPerformanceContainers: 0,
  }
}

export async function fetchBiletimgoUnique(
  cities: string[],
  options?: { knownExternalIds?: string[] }
): Promise<{
  events: NaEvent[]
  diagnostics: ProviderDiagnostics
  rawListingDiscoveries: number
  uniqueExternalIds: number
  uniqueIdList: string[]
  rawListingIds: string[]
  crossCityRepeatedIds: number
  detailsAvoided: number
  discoveryCityMismatch: number
  listingRequests: number
  detailRequests: number
  listingDurationMs: number
  detailDurationMs: number
}> {
  const firstCard = new Map<string, BiletimgoListingCard>()
  const listingCities = new Map<string, Set<string>>()
  const diagnostics = emptyDiag('EMPTY')
  let rawListingDiscoveries = 0
  let listingRequests = 0
  const listingStarted = Date.now()

  for (const citySlug of cities) {
    const plate = getProvincePlate(citySlug)
    const url = plate
      ? `${BILETIMGO_BASE}/etkinlik-takvimi-${citySlug}-${plate}`
      : `${BILETIMGO_BASE}/sehir-etkinlikleri`
    const listing = await fetchDocument(url)
    listingRequests += 1
    diagnostics.pagesFetched += 1
    if (looksLikeRateLimit(listing.status)) {
      diagnostics.status = 'RATE_LIMITED'
      diagnostics.message = `HTTP ${listing.status}`
      continue
    }
    if (looksLikeChallengePage(listing.text, listing.status) || listing.status === 403) {
      diagnostics.blocked = true
      diagnostics.status = 'BLOCKED'
      diagnostics.message = `HTTP ${listing.status}`
      continue
    }
    if (!listing.ok) {
      diagnostics.status = diagnostics.status === 'BLOCKED' ? 'BLOCKED' : 'FETCH_FAILED'
      diagnostics.message = `HTTP ${listing.status}`
      continue
    }
    const cards = collectBiletimgoListingCards(listing.text, BILETIMGO_BASE)
    rawListingDiscoveries += cards.length
    diagnostics.discovered += cards.length
    for (const card of cards) {
      if (!listingCities.has(card.numericId)) listingCities.set(card.numericId, new Set())
      listingCities.get(card.numericId)!.add(citySlug)
      if (!firstCard.has(card.numericId)) firstCard.set(card.numericId, card)
    }
  }
  const listingDurationMs = Date.now() - listingStarted

  const uniqueExternalIds = firstCard.size
  const uniqueIdList = [...firstCard.keys()].sort()
  const rawListingIds = [...firstCard.keys()]
  const crossCityRepeatedIds = [...listingCities.values()].filter((set) => set.size > 1).length
  const knownIds = new Set(options?.knownExternalIds ?? [])
  const unknownCards = [...firstCard.values()].filter((card) => !knownIds.has(card.numericId))
  const knownSkipped = Math.max(0, firstCard.size - unknownCards.length)
  const toFetch = unknownCards.slice(0, UNIQUE_DETAIL_CAP)
  const detailsAvoided = Math.max(0, rawListingDiscoveries - uniqueExternalIds) + knownSkipped
  const events: NaEvent[] = []
  let discoveryCityMismatch = 0
  let detailRequests = 0
  const detailStarted = Date.now()

  for (const card of toFetch) {
    const detail = await fetchDocument(card.href)
    detailRequests += 1
    diagnostics.detailFetches += 1
    if (looksLikeChallengePage(detail.text, detail.status)) {
      diagnostics.blocked = true
      continue
    }
    if (!detail.ok) {
      diagnostics.invalid += 1
      continue
    }
    const parsed = parseBiletimgoDetail(detail.text, card.href)
    if (!parsed.startsAt || !parsed.title) {
      diagnostics.invalid += 1
      continue
    }
    const cityFromDetail = parsed.city ? slugifyCity(parsed.city) : ''
    const listingSet = listingCities.get(card.numericId)
    if (cityFromDetail && listingSet && ![...listingSet].includes(cityFromDetail)) {
      discoveryCityMismatch += 1
    }
    const mapped = mapBiletimgoOccurrence({
      numericId: card.numericId,
      pageUrl: card.href,
      title: parsed.title,
      description: parsed.description,
      venue: parsed.venue || card.venue,
      address: parsed.address,
      city: parsed.city,
      citySlug: cityFromDetail || undefined,
      imageUrl: parsed.imageUrl || card.imageUrl,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
    })
    if (mapped) events.push(mapped)
    else diagnostics.invalid += 1
  }

  if (firstCard.size > UNIQUE_DETAIL_CAP) diagnostics.status = 'PARTIAL'
  else if (diagnostics.status === 'EMPTY' && events.length > 0) diagnostics.status = 'SUCCESS'
  else if (diagnostics.status === 'EMPTY' && events.length === 0 && rawListingDiscoveries > 0) {
    diagnostics.status = 'PARTIAL'
  }
  diagnostics.occurrences = events.length
  diagnostics.discovered = rawListingDiscoveries

  return {
    events,
    diagnostics,
    rawListingDiscoveries,
    uniqueExternalIds,
    uniqueIdList,
    rawListingIds,
    crossCityRepeatedIds,
    detailsAvoided,
    discoveryCityMismatch,
    listingRequests,
    listingDurationMs,
    detailDurationMs: Date.now() - detailStarted,
    detailRequests,
  }
}
