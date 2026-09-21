/**
 * Biletix recurring-discovery helpers.
 * Identity is the stable Solr / provider event code — not title.
 */
import type { NaEvent } from '@/types/event'

export type BiletixDiscoveryStrategy = 'national_solr' | 'city_partition' | 'hybrid'

export const BILETIX_CITY_MAX_PAGES = 3
export const BILETIX_NATIONAL_CRON_PAGES = 12
export const BILETIX_PRODUCTION_PAGE_CAP = 20
export const BILETIX_PARITY_THRESHOLD = 0.95
export const CRON_WRITE_CANARY_PROVINCES = ['canakkale', 'tunceli', 'samsun'] as const

/** Chosen after V2.8 read-only parity. Coverage-first; do not flush national extras. */
export const BILETIX_CRON_STRATEGY: BiletixDiscoveryStrategy = 'city_partition'

export function biletixIdentityKey(event: Pick<NaEvent, 'externalId' | 'id'> | { id?: string }): string {
  const externalId = 'externalId' in event ? event.externalId : undefined
  const id = event.id ?? ''
  return String(externalId || id).trim()
}

export function compareBiletixIdentitySets(nationalIds: string[], cityIds: string[]) {
  const national = new Set(nationalIds.filter(Boolean))
  const city = new Set(cityIds.filter(Boolean))
  const intersection: string[] = []
  const nationalOnly: string[] = []
  const cityOnly: string[] = []
  for (const id of national) {
    if (city.has(id)) intersection.push(id)
    else nationalOnly.push(id)
  }
  for (const id of city) {
    if (!national.has(id)) cityOnly.push(id)
  }
  const cityCoverage = city.size === 0 ? 1 : intersection.length / city.size
  return {
    nationalCount: national.size,
    cityCount: city.size,
    intersectionCount: intersection.length,
    nationalOnlyCount: nationalOnly.length,
    cityOnlyCount: cityOnly.length,
    cityCoverage,
    intersection,
    nationalOnly,
    cityOnly,
  }
}

export function pagesNeeded(numFound: number, rows: number): number {
  if (numFound <= 0 || rows <= 0) return 0
  return Math.ceil(numFound / rows)
}

export function nationalPageCapCoverage(input: {
  numFound: number
  rows: number
  maxPages: number
}): { docsFetchedMax: number; pagesRequired: number; capped: boolean; coverageOfNumFound: number } {
  const pagesRequired = pagesNeeded(input.numFound, input.rows)
  const docsFetchedMax = Math.min(input.numFound, input.maxPages * input.rows)
  const coverageOfNumFound = input.numFound <= 0 ? 1 : docsFetchedMax / input.numFound
  return {
    docsFetchedMax,
    pagesRequired,
    capped: input.maxPages < pagesRequired,
    coverageOfNumFound,
  }
}

export type CityOnlyRootCause =
  | 'PAGE_CAP_12'
  | 'PAGE_CAP_20'
  | 'NOT_FETCHED_PAGE_CAP'
  | 'CITY_FILTER_ONLY'
  | 'SOURCE_DRIFT'

export function classifyCityOnlyCause(input: {
  nationalPage: number | null
  nationalCronPages?: number
  productionCapPages?: number
  nationalExhausted: boolean
}): CityOnlyRootCause {
  const cronPages = input.nationalCronPages ?? BILETIX_NATIONAL_CRON_PAGES
  const cap = input.productionCapPages ?? BILETIX_PRODUCTION_PAGE_CAP
  if (input.nationalPage != null) {
    if (input.nationalPage > cap) return 'PAGE_CAP_20'
    if (input.nationalPage > cronPages) return 'PAGE_CAP_12'
  }
  if (!input.nationalExhausted) return 'NOT_FETCHED_PAGE_CAP'
  return 'CITY_FILTER_ONLY'
}

export function chooseBiletixDiscoveryStrategy(input: {
  citySetSize: number
  cityIdsCoveredByChosen: number
  unverified001: number
  nationalAtCurrentCapCoverage: number
  nationalAtRaisedCapCoverage: number
}): {
  strategy: BiletixDiscoveryStrategy
  parityPct: number
  pass: boolean
  reason: string
} {
  if (input.unverified001 > 0) {
    return {
      strategy: 'city_partition',
      parityPct: 0,
      pass: false,
      reason: 'UNVERIFIED_001 must stay 0',
    }
  }
  const cityParity = input.citySetSize === 0 ? 1 : input.cityIdsCoveredByChosen / input.citySetSize
  if (cityParity >= BILETIX_PARITY_THRESHOLD) {
    const preferNational =
      input.nationalAtRaisedCapCoverage >= BILETIX_PARITY_THRESHOLD &&
      input.nationalAtRaisedCapCoverage >= cityParity
    return {
      strategy: preferNational ? 'national_solr' : 'city_partition',
      parityPct: preferNational ? input.nationalAtRaisedCapCoverage : cityParity,
      pass: true,
      reason: preferNational
        ? 'national Solr reaches >=95% of city inventory inside a bounded page cap'
        : 'city-filtered Solr is required to keep valid inventory',
    }
  }
  if (input.nationalAtRaisedCapCoverage >= BILETIX_PARITY_THRESHOLD) {
    return {
      strategy: 'national_solr',
      parityPct: input.nationalAtRaisedCapCoverage,
      pass: true,
      reason: 'raising bounded national pagination recovers city inventory',
    }
  }
  return {
    strategy: 'city_partition',
    parityPct: cityParity,
    pass: false,
    reason: 'neither national nor chosen set reached 95% of verifiable city inventory',
  }
}

export function filterEventsToProvinces<T extends { citySlug?: string | null }>(
  events: T[],
  slugs: readonly string[]
): T[] {
  const allowed = new Set(slugs)
  return events.filter((event) => event.citySlug != null && allowed.has(event.citySlug))
}

export function shouldUseCityPartitionedBiletix(input: {
  strategy?: BiletixDiscoveryStrategy
  citySlugs?: string[]
  nationalProvinceCount?: number
}): boolean {
  const strategy = input.strategy ?? BILETIX_CRON_STRATEGY
  if (strategy === 'city_partition' || strategy === 'hybrid') return true
  const national = input.nationalProvinceCount ?? 81
  return Boolean(input.citySlugs && input.citySlugs.length > 0 && input.citySlugs.length < national)
}
