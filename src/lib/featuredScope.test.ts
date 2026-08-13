import { describe, expect, it } from 'vitest'
import {
  isCityFeaturedEligible,
  isLocalScopedNews,
  isNationalFeaturedEligible,
} from '@/lib/featuredScope'

describe('featuredScope', () => {
  it('national category + citySlug stays national featured (not local-only)', () => {
    expect(isLocalScopedNews({ citySlug: 'canakkale', category: 'gundem' })).toBe(false)
    expect(isNationalFeaturedEligible({ citySlug: 'canakkale', category: 'gundem' })).toBe(true)
    expect(isNationalFeaturedEligible({ citySlug: 'istanbul', category: 'son-dakika' })).toBe(true)
    expect(isNationalFeaturedEligible({ citySlug: 'ankara', category: 'finans-piyasa' })).toBe(true)
    expect(isNationalFeaturedEligible({ citySlug: 'izmir', categoryId: 'siyaset' })).toBe(true)
  })

  it('yerel-* + featured is city-scoped only (not national featured)', () => {
    expect(isLocalScopedNews({ category: 'yerel-haber' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-spor' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-futbol' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-duyuru' })).toBe(true)
    expect(isLocalScopedNews({ citySlug: 'canakkale', category: 'yerel-siyaset' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'yerel-gundem' })).toBe(false)
    expect(isNationalFeaturedEligible({ citySlug: 'canakkale', category: 'yerel-haber' })).toBe(
      false
    )
  })

  it('keeps national news without city eligible for main featured', () => {
    expect(isLocalScopedNews({ category: 'gundem' })).toBe(false)
    expect(isNationalFeaturedEligible({ category: 'spor', citySlug: '' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'magazin' })).toBe(true)
  })

  it('city featured only accepts yerel tree for that city', () => {
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'yerel-haber',
        forCitySlug: 'canakkale',
      })
    ).toBe(true)
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'yerel-spor',
        forCitySlug: 'canakkale',
      })
    ).toBe(true)
    // National category with city → national carousel, not city featured pin pool
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'gundem',
        forCitySlug: 'canakkale',
      })
    ).toBe(false)
    expect(
      isCityFeaturedEligible({
        citySlug: 'istanbul',
        category: 'yerel-haber',
        forCitySlug: 'canakkale',
      })
    ).toBe(false)
  })

  it('son dakika + citySlug remains national (breaking / featured eligible)', () => {
    expect(isLocalScopedNews({ citySlug: 'canakkale', category: 'son-dakika' })).toBe(false)
    expect(isNationalFeaturedEligible({ citySlug: 'canakkale', category: 'son-dakika' })).toBe(
      true
    )
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'son-dakika',
        forCitySlug: 'canakkale',
      })
    ).toBe(false)
  })
})
