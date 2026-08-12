import { describe, expect, it } from 'vitest'
import {
  resolveDistrictDisplayLabel,
  withDistrictCategoryLabel,
} from '@/lib/districtLabel'

describe('resolveDistrictDisplayLabel', () => {
  it('prefers display name from districtSlug', () => {
    expect(resolveDistrictDisplayLabel({ districtSlug: 'biga' })).toBe('Biga')
    expect(resolveDistrictDisplayLabel({ districtSlug: 'bozcaada' })).toBe('Bozcaada')
  })

  it('falls back to district name when slug missing', () => {
    expect(resolveDistrictDisplayLabel({ district: 'Çan' })).toBe('Çan')
  })

  it('returns null when nothing is set', () => {
    expect(resolveDistrictDisplayLabel({})).toBeNull()
    expect(resolveDistrictDisplayLabel({ district: '  ', districtSlug: '' })).toBeNull()
  })

  it('ignores unknown slugs without a display name or district string', () => {
    expect(resolveDistrictDisplayLabel({ districtSlug: 'not-a-real-district-xyz' })).toBeNull()
  })
})

describe('withDistrictCategoryLabel', () => {
  it('appends district with middle dot', () => {
    expect(withDistrictCategoryLabel('Yerel Siyaset', 'Biga')).toBe('Yerel Siyaset · Biga')
  })

  it('keeps category alone when district missing', () => {
    expect(withDistrictCategoryLabel('Yerel Siyaset', null)).toBe('Yerel Siyaset')
  })
})
