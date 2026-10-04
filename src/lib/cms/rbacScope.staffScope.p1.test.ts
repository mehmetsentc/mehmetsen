import { describe, expect, it } from 'vitest'
import {
  canAccessCategory,
  canAccessContentScope,
  canAccessProvince,
  canManageProvinceSettings,
  contentScopeOf,
  isScopeRestricted,
  parseStaffScope,
  UNSCOPED_STAFF,
} from '@/lib/cms/rbacScope'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'

const isCanonical = (s: string) => isTurkishProvinceSlug(s) && normalizeCitySlug(s) === s
const parse = (raw: unknown) => parseStaffScope(raw, isCanonical)

describe('Phase 1 staff scope — parseStaffScope', () => {
  it('missing / null cmsScope = unscoped legacy staff', () => {
    expect(parse(undefined)).toEqual({ kind: 'unscoped' })
    expect(parse(null)).toEqual({ kind: 'unscoped' })
  })

  it('city manager: province only', () => {
    expect(parse({ provinceSlugs: ['canakkale'], categoryIds: [] })).toEqual({
      kind: 'scoped',
      scope: { provinceSlugs: ['canakkale'], categoryIds: [] },
    })
  })

  it('category manager: province + category (normalized, deduped)', () => {
    expect(parse({ provinceSlugs: [' Canakkale ', 'canakkale'], categoryIds: ['SPOR'] })).toEqual({
      kind: 'scoped',
      scope: { provinceSlugs: ['canakkale'], categoryIds: ['spor'] },
    })
  })

  it('explicit empty scope is NOT global — it is invalid (deny all)', () => {
    expect(parse({})).toEqual({ kind: 'invalid', reason: 'empty_scope' })
    expect(parse({ provinceSlugs: [], categoryIds: [] })).toEqual({ kind: 'invalid', reason: 'empty_scope' })
  })

  it('malformed scopes fail closed', () => {
    expect(parse('canakkale').kind).toBe('invalid')
    expect(parse(['canakkale']).kind).toBe('invalid')
    expect(parse({ provinceSlugs: 'canakkale' }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['atlantis'] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale', 42] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: [''] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale'], categoryIds: ['spor; drop'] }).kind).toBe('invalid')
    expect(parse({ categoryIds: [{}] }).kind).toBe('invalid')
  })

  it('isScopeRestricted is true for scoped and invalid', () => {
    expect(isScopeRestricted(UNSCOPED_STAFF)).toBe(false)
    expect(isScopeRestricted(parse({ provinceSlugs: ['canakkale'] }))).toBe(true)
    expect(isScopeRestricted(parse({}))).toBe(true)
  })
})

describe('Phase 1 staff scope — content access matrix', () => {
  const city = parse({ provinceSlugs: ['canakkale'] })
  const sports = parse({ provinceSlugs: ['canakkale'], categoryIds: ['spor'] })
  const nationalSports = parse({ categoryIds: ['spor'] })
  const invalid = parse({})

  it('unscoped: everything', () => {
    expect(canAccessContentScope(UNSCOPED_STAFF, { citySlug: 'antalya', categoryId: 'ekonomi' })).toBe(true)
    expect(canAccessContentScope(UNSCOPED_STAFF, {})).toBe(true)
  })

  it('Çanakkale city manager', () => {
    expect(canAccessContentScope(city, { citySlug: 'canakkale', categoryId: 'ekonomi' })).toBe(true)
    expect(canAccessContentScope(city, { citySlug: 'canakkale', categoryId: '' })).toBe(true)
    expect(canAccessContentScope(city, { citySlug: 'antalya', categoryId: 'spor' })).toBe(false)
    expect(canAccessContentScope(city, { citySlug: '', categoryId: 'spor' })).toBe(false)
    expect(canAccessContentScope(city, {})).toBe(false)
  })

  it('Çanakkale sports manager = intersection, never OR', () => {
    expect(canAccessContentScope(sports, { citySlug: 'canakkale', categoryId: 'spor' })).toBe(true)
    expect(canAccessContentScope(sports, { citySlug: 'canakkale', categoryId: 'ekonomi' })).toBe(false)
    expect(canAccessContentScope(sports, { citySlug: 'antalya', categoryId: 'spor' })).toBe(false)
    expect(canAccessContentScope(sports, { citySlug: '', categoryId: 'spor' })).toBe(false)
    expect(canAccessContentScope(sports, { citySlug: 'canakkale', categoryId: '' })).toBe(false)
  })

  it('category-only scope (national desk) restricts category, not province', () => {
    expect(canAccessContentScope(nationalSports, { citySlug: 'antalya', categoryId: 'spor' })).toBe(true)
    expect(canAccessContentScope(nationalSports, { citySlug: '', categoryId: 'spor' })).toBe(true)
    expect(canAccessContentScope(nationalSports, { citySlug: 'canakkale', categoryId: 'ekonomi' })).toBe(false)
  })

  it('invalid scope denies everything', () => {
    expect(canAccessContentScope(invalid, { citySlug: 'canakkale', categoryId: 'spor' })).toBe(false)
    expect(canAccessProvince(invalid, 'canakkale')).toBe(false)
    expect(canAccessCategory(invalid, 'spor')).toBe(false)
  })

  it('comparison is case/space-insensitive on the resource side', () => {
    expect(canAccessContentScope(sports, { citySlug: ' Canakkale', categoryId: 'Spor ' })).toBe(true)
  })

  it('city settings: province admins only (no category managers, no category-only scopes)', () => {
    expect(canManageProvinceSettings(UNSCOPED_STAFF, 'antalya')).toBe(true)
    expect(canManageProvinceSettings(city, 'canakkale')).toBe(true)
    expect(canManageProvinceSettings(city, 'antalya')).toBe(false)
    expect(canManageProvinceSettings(sports, 'canakkale')).toBe(false)
    expect(canManageProvinceSettings(nationalSports, 'canakkale')).toBe(false)
    expect(canManageProvinceSettings(invalid, 'canakkale')).toBe(false)
  })

  it('contentScopeOf reads canonical doc fields with legacy category fallback', () => {
    expect(contentScopeOf({ citySlug: 'canakkale', categoryId: 'spor' })).toEqual({ citySlug: 'canakkale', categoryId: 'spor' })
    expect(contentScopeOf({ citySlug: 'canakkale', category: 'spor' })).toEqual({ citySlug: 'canakkale', categoryId: 'spor' })
    expect(contentScopeOf({ citySlug: 5, categoryId: null })).toEqual({ citySlug: '', categoryId: '' })
    expect(contentScopeOf(undefined)).toEqual({ citySlug: '', categoryId: '' })
  })
})
