import { describe, expect, it } from 'vitest'
import { isLocalScopedNews, isNationalFeaturedEligible } from '@/lib/featuredScope'

describe('featuredScope', () => {
  it('treats citySlug as local-scoped', () => {
    expect(isLocalScopedNews({ citySlug: 'canakkale', category: 'gundem' })).toBe(true)
    expect(isNationalFeaturedEligible({ citySlug: 'canakkale', category: 'gundem' })).toBe(false)
  })

  it('treats yerel category tree as local-scoped', () => {
    expect(isLocalScopedNews({ category: 'yerel-haber' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-spor' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-futbol' })).toBe(true)
    expect(isLocalScopedNews({ categoryId: 'yerel-duyuru' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'yerel-gundem' })).toBe(false)
  })

  it('keeps national news eligible for main featured', () => {
    expect(isLocalScopedNews({ category: 'gundem' })).toBe(false)
    expect(isNationalFeaturedEligible({ category: 'spor', citySlug: '' })).toBe(true)
    expect(isNationalFeaturedEligible({ category: 'magazin' })).toBe(true)
  })
})
