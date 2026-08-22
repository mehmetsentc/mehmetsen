import { describe, expect, it } from 'vitest'
import { LOCAL_PORTAL_FEEDS } from '@/services/newsroom/sources/localSources'
import { canonicalLegacyRegistryKey } from './legacySourceMap'
import {
  buildLocalCityRegistry,
  localPortalToRegistryEntry,
  portalLegacyIdToRegistryKey,
} from './localCityRegistry'
import {
  LOCAL_CITY_SOURCE_REGISTRY,
  NATIONAL_SOURCE_REGISTRY,
  TURKEY_SOURCE_REGISTRY,
} from './turkeyRegistry'

describe('local city crawler registry', () => {
  it('includes 300+ curated local portals across 81 provinces', () => {
    expect(LOCAL_CITY_SOURCE_REGISTRY.length).toBeGreaterThanOrEqual(300)
    const citySlugs = new Set(
      LOCAL_PORTAL_FEEDS.map((p) => p.localMeta.citySlug)
    )
    expect(citySlugs.size).toBe(81)
  })

  it('has unique registry keys and domains', () => {
    const keys = TURKEY_SOURCE_REGISTRY.map((e) => e.key)
    const domains = TURKEY_SOURCE_REGISTRY.map((e) => e.domain.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(domains).size).toBe(domains.length)
  })

  it('does not duplicate national registry domains', () => {
    const nationalDomains = new Set(NATIONAL_SOURCE_REGISTRY.map((e) => e.domain.toLowerCase()))
    for (const entry of LOCAL_CITY_SOURCE_REGISTRY) {
      expect(nationalDomains.has(entry.domain.toLowerCase())).toBe(false)
    }
  })

  it('maps Antalya portal sample with city scope and LOCAL category', () => {
    const portal = LOCAL_PORTAL_FEEDS.find((p) => p.id === 'portal-antalya-ekspres')
    expect(portal).toBeDefined()
    const entry = localPortalToRegistryEntry(portal!)
    expect(entry.key).toBe('antalya-ekspres')
    expect(entry.name).toBe('Antalya Ekspres')
    expect(entry.domain).toBe('antalyaekspres.com.tr')
    expect(entry.scope).toBe('CITY')
    expect(entry.category).toBe('LOCAL')
    expect(entry.city).toBe('Antalya')
    expect(entry.region).toBe('Akdeniz')
    expect(entry.rssUrls).toEqual(['https://www.antalyaekspres.com.tr/rss'])

    const inRegistry = LOCAL_CITY_SOURCE_REGISTRY.find((e) => e.key === 'antalya-ekspres')
    expect(inRegistry).toBeDefined()
  })

  it('maps district portals to DISTRICT scope', () => {
    const portal = LOCAL_PORTAL_FEEDS.find((p) => p.id === 'portal-antalya-manavgat')
    expect(portal?.localMeta.district).toBe('Manavgat')
    const entry = localPortalToRegistryEntry(portal!)
    expect(entry.scope).toBe('DISTRICT')
    expect(entry.district).toBe('Manavgat')
    expect(entry.crawlPriority).toBe('LOW')
  })

  it('resolves legacy portal ids to registry keys', () => {
    expect(portalLegacyIdToRegistryKey('portal-antalya-ekspres')).toBe('antalya-ekspres')
    expect(canonicalLegacyRegistryKey('portal-antalya-ekspres')).toBe('antalya-ekspres')
    expect(canonicalLegacyRegistryKey('portal-canakkale-olay')).toBe('canakkaleolay')
  })

  it('buildLocalCityRegistry skips domains already seeded nationally', () => {
    const nationalDomains = new Set(['canakkaleolay.com'])
    const built = buildLocalCityRegistry(nationalDomains)
    expect(built.some((e) => e.domain === 'canakkaleolay.com')).toBe(false)
    expect(built.length).toBe(LOCAL_CITY_SOURCE_REGISTRY.length)
  })
})
