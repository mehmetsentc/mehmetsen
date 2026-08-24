import { describe, expect, it } from 'vitest'
import {
  dutyPharmacyDistrictChips,
  filterDutyPharmacyGroups,
  resolveOfficialDistrictSlug,
} from '@/lib/dutyPharmacies/officialDistrict'
import type { DutyPharmacyGroup } from '@/types/dutyPharmacy'

function group(district: string, districtSlug: string, count = 1): DutyPharmacyGroup {
  return {
    district,
    districtSlug,
    pharmacies: Array.from({ length: count }, (_, i) => ({
      name: `${district} ${i + 1}`,
      address: '',
      phone: '',
      phoneHref: '',
      dutyLabel: '',
      dutyStart: null,
      dutyEnd: null,
      mapsUrl: null,
      lat: null,
      lng: null,
    })),
  }
}

describe('resolveOfficialDistrictSlug', () => {
  it('maps belde groups onto the parent ilçe', () => {
    expect(resolveOfficialDistrictSlug('ayvacik-kucukkuyu', 'canakkale')).toBe('ayvacik')
    expect(resolveOfficialDistrictSlug('ezine-geyikli', 'canakkale')).toBe('ezine')
    expect(resolveOfficialDistrictSlug('lapseki-cardak', 'canakkale')).toBe('lapseki')
  })

  it('keeps official ilçe slugs as-is', () => {
    expect(resolveOfficialDistrictSlug('merkez', 'canakkale')).toBe('merkez')
    expect(resolveOfficialDistrictSlug('biga', 'canakkale')).toBe('biga')
    expect(resolveOfficialDistrictSlug('can', 'canakkale')).toBe('can')
    expect(resolveOfficialDistrictSlug('muratpasa', 'antalya')).toBe('muratpasa')
    expect(resolveOfficialDistrictSlug('alanya', 'antalya')).toBe('alanya')
  })
})

describe('filterDutyPharmacyGroups', () => {
  const groups = [
    group('Merkez', 'merkez', 3),
    group('Ayvacık', 'ayvacik', 1),
    group('Ayvacık / Küçükkuyu', 'ayvacik-kucukkuyu', 1),
    group('Biga', 'biga', 1),
  ]

  it('returns only groups for the selected official district', () => {
    const ayvacik = filterDutyPharmacyGroups(groups, 'ayvacik', 'canakkale')
    expect(ayvacik.map((g) => g.districtSlug)).toEqual(['ayvacik', 'ayvacik-kucukkuyu'])
    expect(
      filterDutyPharmacyGroups(groups, 'biga', 'canakkale').map((g) => g.districtSlug)
    ).toEqual(['biga'])
    expect(filterDutyPharmacyGroups(groups, 'yenice', 'canakkale')).toEqual([])
  })

  it('builds chips from official ilçeler, not belde headings', () => {
    const chips = dutyPharmacyDistrictChips(groups, 'canakkale')
    expect(chips.map((c) => c.slug)).toEqual(['merkez', 'ayvacik', 'biga'])
    expect(chips.find((c) => c.slug === 'ayvacik')?.count).toBe(2)
  })
})
