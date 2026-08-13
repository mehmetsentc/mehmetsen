import { describe, expect, it } from 'vitest'
import {
  isExcludedFromCityLocalPrimaryFeed,
  isExcludedFromHomepageMainSlots,
  isNationalGastronomyCategory,
  shouldSkipLocalPrimaryRemapForGastronomy,
  shouldStripCityForGastronomy,
} from '@/lib/gastronomyRouting'

describe('gastronomyRouting', () => {
  it('treats gastronomi as national (not city-owned)', () => {
    expect(isNationalGastronomyCategory('gastronomi')).toBe(true)
    expect(isNationalGastronomyCategory('GASTRONOMI')).toBe(true)
    expect(isNationalGastronomyCategory('yerel-gastronomi')).toBe(false)
    expect(isNationalGastronomyCategory('gundem')).toBe(false)
  })

  it('excludes gastronomi from city primary yerel feeds', () => {
    expect(isExcludedFromCityLocalPrimaryFeed('gastronomi')).toBe(true)
    expect(isExcludedFromCityLocalPrimaryFeed('yerel-gastronomi')).toBe(false)
    expect(isExcludedFromCityLocalPrimaryFeed('yerel-haber')).toBe(false)
  })

  it('excludes gastronomi from homepage main / güncel / featured slots', () => {
    expect(isExcludedFromHomepageMainSlots('gastronomi')).toBe(true)
    expect(isExcludedFromHomepageMainSlots('yerel-gastronomi')).toBe(true)
    expect(isExcludedFromHomepageMainSlots('gundem')).toBe(false)
  })

  it('strips city and skips yerel remap for national gastronomi', () => {
    expect(shouldStripCityForGastronomy('gastronomi')).toBe(true)
    expect(shouldSkipLocalPrimaryRemapForGastronomy('gastronomi')).toBe(true)
    expect(shouldStripCityForGastronomy('yerel-gastronomi')).toBe(false)
    expect(shouldSkipLocalPrimaryRemapForGastronomy('yerel-gastronomi')).toBe(false)
  })
})
