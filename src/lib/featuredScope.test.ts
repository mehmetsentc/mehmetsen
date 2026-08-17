import { describe, expect, it } from 'vitest'
import {
  isCityFeaturedEligible,
  isCityFeaturedPin,
  isKibrisFeaturedEligible,
  isKibrisScopedNews,
  isLocalScopedNews,
  isNationalBreakingEligible,
  isNationalFeaturedEligible,
  pickCityFeaturedCarouselItems,
  pickHomeFeedFeaturedPins,
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

  it('kibris-* featured is KKTC-page only (not national /feed Öne Çıkan)', () => {
    expect(isKibrisScopedNews({ category: 'kibris-haberleri' })).toBe(true)
    expect(isKibrisScopedNews({ categoryId: 'kibris-teknoloji' })).toBe(true)
    expect(isKibrisScopedNews({ categoryId: 'kibris-siyaset' })).toBe(true)
    expect(isKibrisFeaturedEligible({ category: 'kibris-teknoloji' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'kibris-teknoloji' })).toBe(false)
    expect(isNationalFeaturedEligible({ category: 'kibris-haberleri' })).toBe(false)
    expect(isNationalFeaturedEligible({ categoryId: 'kibris-gundem' })).toBe(false)
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'kibris-teknoloji',
        forCitySlug: 'canakkale',
      })
    ).toBe(false)
  })

  it('keeps national news without city eligible for main featured', () => {
    expect(isLocalScopedNews({ category: 'gundem' })).toBe(false)
    expect(isNationalFeaturedEligible({ category: 'spor', citySlug: '' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'magazin' })).toBe(true)
  })

  it('never allows gastronomi in homepage or city featured / manşet', () => {
    expect(isNationalFeaturedEligible({ category: 'gastronomi' })).toBe(false)
    expect(isNationalFeaturedEligible({ categoryId: 'gastronomi', citySlug: 'agri' })).toBe(false)
    expect(isNationalFeaturedEligible({ category: 'yerel-gastronomi' })).toBe(false)
    expect(
      isCityFeaturedEligible({
        citySlug: 'agri',
        category: 'gastronomi',
        forCitySlug: 'agri',
      })
    ).toBe(false)
    expect(
      isCityFeaturedEligible({
        citySlug: 'agri',
        category: 'yerel-gastronomi',
        forCitySlug: 'agri',
      })
    ).toBe(false)
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
    expect(isNationalBreakingEligible({ citySlug: 'istanbul', category: 'son-dakika' })).toBe(true)
    expect(
      isCityFeaturedEligible({
        citySlug: 'canakkale',
        category: 'son-dakika',
        forCitySlug: 'canakkale',
      })
    ).toBe(false)
  })

  it('yerel or kıbrıs son dakika is not national breaking', () => {
    expect(
      isNationalBreakingEligible({ category: 'yerel-haber', citySlug: 'antalya' })
    ).toBe(false)
    expect(isNationalBreakingEligible({ category: 'yerel-asayis' })).toBe(false)
    expect(isNationalBreakingEligible({ category: 'kibris-haberleri' })).toBe(false)
    expect(
      isNationalBreakingEligible({
        category: 'son-dakika',
        originalCategoryId: 'yerel-haber',
      })
    ).toBe(false)
    expect(
      isNationalBreakingEligible({
        category: 'son-dakika',
        originalCategoryId: 'kibris-saglik',
      })
    ).toBe(false)
    expect(isLocalScopedNews({ category: 'son-dakika', originalCategoryId: 'yerel-gundem' })).toBe(
      true
    )
    expect(isKibrisScopedNews({ category: 'son-dakika', originalCategoryId: 'kibris-haberleri' })).toBe(
      true
    )
    expect(
      isNationalBreakingEligible({ category: 'son-dakika', originalCategoryId: 'gundem' })
    ).toBe(true)
  })

  it('localFeatured pins a city page even for national categories', () => {
    expect(
      isCityFeaturedPin({
        citySlug: 'antalya',
        category: 'gundem',
        localFeatured: true,
        forCitySlug: 'antalya',
      })
    ).toBe(true)
    expect(
      isCityFeaturedPin({
        citySlug: 'antalya',
        category: 'gundem',
        localFeatured: true,
        forCitySlug: 'izmir',
      })
    ).toBe(false)
    expect(
      isNationalFeaturedEligible({ citySlug: 'antalya', category: 'gundem' })
    ).toBe(true)
  })

  it('legacy featured + yerel still counts as city pin without localFeatured', () => {
    expect(
      isCityFeaturedPin({
        citySlug: 'antalya',
        category: 'yerel-haber',
        featured: true,
        forCitySlug: 'antalya',
      })
    ).toBe(true)
    expect(
      isCityFeaturedPin({
        citySlug: 'antalya',
        category: 'gundem',
        featured: true,
        forCitySlug: 'antalya',
      })
    ).toBe(false)
  })

  it('carousel uses pins when present, otherwise latest 10 excluding gastronomi', () => {
    const items = [
      { id: '1', category: 'yerel-haber', citySlug: 'antalya', featured: true },
      { id: '2', category: 'yerel-spor', citySlug: 'antalya' },
      { id: '3', category: 'gastronomi', citySlug: 'antalya' },
      { id: '4', category: 'gundem', citySlug: 'antalya', localFeatured: true },
    ]
    const pinned = pickCityFeaturedCarouselItems(items, 'antalya', 10)
    expect(pinned.map((p) => p.id)).toEqual(['1', '4'])

    const fallback = pickCityFeaturedCarouselItems(
      [
        { id: 'a', category: 'yerel-haber', citySlug: 'antalya' },
        { id: 'b', category: 'gastronomi', citySlug: 'antalya' },
        { id: 'c', category: 'gundem', citySlug: 'antalya' },
      ],
      'antalya',
      10
    )
    expect(fallback.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('city homepage carousel keeps localFeatured pins that are not nationally featured', () => {
    const featured = [
      { id: 'old-national-pin', featured: true },
      { id: 'new-city-pin', localFeatured: true },
    ]
    expect(pickHomeFeedFeaturedPins(featured, true, 11).map((p) => p.id)).toEqual([
      'old-national-pin',
      'new-city-pin',
    ])
    expect(pickHomeFeedFeaturedPins(featured, false, 11).map((p) => p.id)).toEqual([
      'old-national-pin',
    ])
  })
})
