import { describe, expect, it } from 'vitest'
import { filterRailItemsForCity, railItemMatchesCity } from '@/lib/feed/scopeFeedRailsToCity'

describe('scopeFeedRailsToCity', () => {
  it('keeps national rails unfiltered when no city is locked', () => {
    const rows = [
      { id: 'izmir', citySlug: 'izmir' },
      { id: 'national', citySlug: null },
    ]
    expect(filterRailItemsForCity(rows, null).map((r) => r.id)).toEqual(['izmir', 'national'])
  })

  it('keeps only the locked city and drops other provinces and unscoped rows', () => {
    const rows = [
      { id: 'cka', citySlug: 'canakkale' },
      { id: 'bornova', citySlug: 'izmir' },
      { id: 'istanbul', citySlug: 'istanbul' },
      { id: 'missing', citySlug: null },
    ]
    expect(filterRailItemsForCity(rows, 'Canakkale').map((r) => r.id)).toEqual(['cka'])
    expect(railItemMatchesCity({ citySlug: 'antalya' }, 'antalya')).toBe(true)
    expect(railItemMatchesCity({ citySlug: 'canakkale' }, 'antalya')).toBe(false)
  })
})
