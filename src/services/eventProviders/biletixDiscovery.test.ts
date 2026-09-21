import { describe, expect, it } from 'vitest'
import {
  BILETIX_CRON_STRATEGY,
  BILETIX_NATIONAL_CRON_PAGES,
  BILETIX_PARITY_THRESHOLD,
  BILETIX_PRODUCTION_PAGE_CAP,
  chooseBiletixDiscoveryStrategy,
  classifyCityOnlyCause,
  compareBiletixIdentitySets,
  filterEventsToProvinces,
  nationalPageCapCoverage,
  pagesNeeded,
  shouldUseCityPartitionedBiletix,
} from './biletixDiscovery'

describe('Biletix discovery parity', () => {
  it('compares national vs city sets by stable provider identity', () => {
    const compared = compareBiletixIdentitySets(['A', 'B', 'C'], ['B', 'C', 'D', 'E'])
    expect(compared.nationalCount).toBe(3)
    expect(compared.cityCount).toBe(4)
    expect(compared.intersectionCount).toBe(2)
    expect(compared.nationalOnlyCount).toBe(1)
    expect(compared.cityOnlyCount).toBe(2)
    expect(compared.cityOnly.sort()).toEqual(['D', 'E'])
  })

  it('treats page-cap math as the national coverage boundary', () => {
    expect(pagesNeeded(2069, 100)).toBe(21)
    const at12 = nationalPageCapCoverage({ numFound: 2069, rows: 100, maxPages: BILETIX_NATIONAL_CRON_PAGES })
    expect(at12.docsFetchedMax).toBe(1200)
    expect(at12.capped).toBe(true)
    const at20 = nationalPageCapCoverage({ numFound: 2069, rows: 100, maxPages: BILETIX_PRODUCTION_PAGE_CAP })
    expect(at20.docsFetchedMax).toBe(2000)
    expect(at20.capped).toBe(true)
  })

  it('classifies city-only IDs found only after the cron page budget', () => {
    expect(classifyCityOnlyCause({ nationalPage: 15, nationalExhausted: false })).toBe('PAGE_CAP_12')
    expect(classifyCityOnlyCause({ nationalPage: 22, nationalExhausted: false })).toBe('PAGE_CAP_20')
    expect(classifyCityOnlyCause({ nationalPage: null, nationalExhausted: false })).toBe('NOT_FETCHED_PAGE_CAP')
    expect(classifyCityOnlyCause({ nationalPage: null, nationalExhausted: true })).toBe('CITY_FILTER_ONLY')
  })

  it('chooses city partitioning when national coverage stays below 95%', () => {
    expect(BILETIX_CRON_STRATEGY).toBe('city_partition')
    const chosen = chooseBiletixDiscoveryStrategy({
      citySetSize: 1902,
      cityIdsCoveredByChosen: 1902,
      unverified001: 0,
      nationalAtCurrentCapCoverage: 1040 / 1902,
      nationalAtRaisedCapCoverage: 1100 / 1902,
    })
    expect(chosen.pass).toBe(true)
    expect(chosen.strategy).toBe('city_partition')
    expect(chosen.parityPct).toBeGreaterThanOrEqual(BILETIX_PARITY_THRESHOLD)
    expect(
      shouldUseCityPartitionedBiletix({
        strategy: 'national_solr',
        citySlugs: ['canakkale', 'tunceli', 'samsun'],
      })
    ).toBe(true)
  })

  it('keeps scoped canary writes inside the three provinces', () => {
    const filtered = filterEventsToProvinces(
      [
        { id: 'a', citySlug: 'canakkale' },
        { id: 'b', citySlug: 'istanbul' },
        { id: 'c', citySlug: 'samsun' },
      ],
      ['canakkale', 'tunceli', 'samsun']
    )
    expect(filtered.map((event) => event.id)).toEqual(['a', 'c'])
  })
})
