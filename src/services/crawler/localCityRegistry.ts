import { LOCAL_PORTAL_FEEDS } from '@/services/newsroom/sources/localSources'
import { PROVINCE_REGION_BY_SLUG } from './provinceRegions'
import { hostnameOf } from './url/normalize'
import type { TurkeyRegistryEntry } from './turkeyRegistry'

/** Strip `portal-` prefix from legacy local worker source ids. */
export function portalLegacyIdToRegistryKey(legacySourceId: string): string {
  return legacySourceId.trim().toLowerCase().replace(/^portal-/, '')
}

/** Legacy portal ids whose registry key differs from the portal id suffix. */
export const PORTAL_LEGACY_ALIASES: Readonly<Record<string, string>> = {
  'portal-canakkale-olay': 'canakkaleolay',
  'canakkale-olay': 'canakkaleolay',
}

function domainFromFeedUrl(feedUrl: string): string {
  const host = hostnameOf(feedUrl)
  return host ? host.replace(/^www\./, '') : ''
}

function baseUrlFromFeed(feedUrl: string, domain: string): string {
  try {
    const url = new URL(feedUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return `https://www.${domain}`
  }
}

export function localPortalToRegistryEntry(
  portal: (typeof LOCAL_PORTAL_FEEDS)[number]
): TurkeyRegistryEntry {
  const key = portalLegacyIdToRegistryKey(portal.id)
  const domain = domainFromFeedUrl(portal.feedUrl)
  const hasDistrict = Boolean(portal.localMeta.district?.trim())
  return {
    key,
    name: portal.label,
    domain,
    baseUrl: baseUrlFromFeed(portal.feedUrl, domain),
    rssUrls: [portal.feedUrl],
    category: 'LOCAL',
    scope: hasDistrict ? 'DISTRICT' : 'CITY',
    city: portal.localMeta.cityName,
    district: hasDistrict ? portal.localMeta.district : undefined,
    region: PROVINCE_REGION_BY_SLUG[portal.localMeta.citySlug],
    crawlPriority: hasDistrict ? 'LOW' : 'NORMAL',
  }
}

export function buildLocalCityRegistry(
  existingDomains: ReadonlySet<string> = new Set()
): TurkeyRegistryEntry[] {
  const seenKeys = new Set<string>()
  const seenDomains = new Set<string>()
  const entries: TurkeyRegistryEntry[] = []

  for (const portal of LOCAL_PORTAL_FEEDS) {
    const entry = localPortalToRegistryEntry(portal)
    const domain = entry.domain.toLowerCase()
    if (!domain || existingDomains.has(domain) || seenDomains.has(domain)) continue
    if (seenKeys.has(entry.key)) continue
    seenKeys.add(entry.key)
    seenDomains.add(domain)
    entries.push(entry)
  }

  return entries
}
