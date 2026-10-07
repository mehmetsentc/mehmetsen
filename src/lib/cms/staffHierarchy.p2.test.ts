import { describe, expect, it } from 'vitest'
import {
  canAccessContentScope,
  canManageProvinceSettings,
  contentScopeOf,
  parseStaffScope,
  staffTierOf,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'
import { buildAssignment, canAssign, canRevoke, canManageProvinceStaff, type HierarchyDeps } from '@/lib/cms/staffHierarchy'
import { isDistrictOfProvince } from '@/lib/cmsAuthServer'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'

const isProv = (s: string) => isTurkishProvinceSlug(s) && normalizeCitySlug(s) === s
const parse = (raw: unknown) => parseStaffScope(raw, isProv, isDistrictOfProvince)
const deps: HierarchyDeps = { isProvinceSlug: isProv, isDistrictOfProvince, isKnownCategory: (c) => ['spor', 'gundem', 'ekonomi'].includes(c) }

const provGen = parse({ provinceSlugs: ['canakkale'] })
const ezine = parse({ provinceSlugs: ['canakkale'], districtSlugs: ['ezine'] })
const merkezSpor = parse({ provinceSlugs: ['canakkale'], districtSlugs: ['merkez'], categoryIds: ['spor'] })
const ant = parse({ provinceSlugs: ['antalya'] })

describe('Phase 2 scope model — district dimension', () => {
  it('parses the four tiers', () => {
    expect(staffTierOf(provGen)).toBe('province_general')
    expect(staffTierOf(parse({ provinceSlugs: ['canakkale'], categoryIds: ['spor'] }))).toBe('province_category')
    expect(staffTierOf(ezine)).toBe('district_general')
    expect(staffTierOf(merkezSpor)).toBe('district_category')
  })
  it('district must belong to the single scoped province (merkez repeats across il)', () => {
    expect(parse({ provinceSlugs: ['canakkale'], districtSlugs: ['alanya'] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale', 'antalya'], districtSlugs: ['ezine'] }).kind).toBe('invalid')
    expect(parse({ districtSlugs: ['ezine'] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale'], districtSlugs: ['../x'] }).kind).toBe('invalid')
    expect(parseStaffScope({ provinceSlugs: ['canakkale'], districtSlugs: ['ezine'] }, isProv).kind).toBe('invalid')
  })
  it('district editor sees only its district, never district-less province news', () => {
    expect(canAccessContentScope(ezine, { citySlug: 'canakkale', districtSlug: 'ezine', categoryId: 'spor' })).toBe(true)
    expect(canAccessContentScope(ezine, { citySlug: 'canakkale', districtSlug: 'biga', categoryId: 'spor' })).toBe(false)
    expect(canAccessContentScope(ezine, { citySlug: 'canakkale', districtSlug: '', categoryId: 'spor' })).toBe(false)
    // same district slug in another province is not in scope
    expect(canAccessContentScope(merkezSpor, { citySlug: 'aksaray', districtSlug: 'merkez', categoryId: 'spor' })).toBe(false)
  })
  it('district+category editor needs all three to match', () => {
    expect(canAccessContentScope(merkezSpor, { citySlug: 'canakkale', districtSlug: 'merkez', categoryId: 'spor' })).toBe(true)
    expect(canAccessContentScope(merkezSpor, { citySlug: 'canakkale', districtSlug: 'merkez', categoryId: 'gundem' })).toBe(false)
  })
  it('province general editor covers district-less and every district of its province only', () => {
    expect(canAccessContentScope(provGen, { citySlug: 'canakkale', districtSlug: '' })).toBe(true)
    expect(canAccessContentScope(provGen, { citySlug: 'canakkale', districtSlug: 'gokceada' })).toBe(true)
    expect(canAccessContentScope(provGen, { citySlug: 'antalya' })).toBe(false)
  })
  it('only province general editors manage province settings', () => {
    expect(canManageProvinceSettings(provGen, 'canakkale')).toBe(true)
    expect(canManageProvinceSettings(ezine, 'canakkale')).toBe(false)
  })
  it('contentScopeOf reads districtSlug', () => {
    expect(contentScopeOf({ citySlug: 'canakkale', districtSlug: 'ezine', category: 'spor' })).toEqual({
      citySlug: 'canakkale', districtSlug: 'ezine', categoryId: 'spor',
    })
  })
})

const id = (uid: string, role: 'super_admin' | 'managing_editor' | 'editor' | 'user', scope: StaffScopeState = { kind: 'unscoped' }) => ({ uid, role, scope })
const superA = id('s', 'super_admin')
const cnkGen = id('pg', 'managing_editor', provGen)
const antGen = id('ag', 'managing_editor', ant)
const plain = id('u', 'user')

describe('Phase 2 assignment rules', () => {
  it('builds exact role + scope per tier; rejects inactive provinces and bad shapes', () => {
    expect(buildAssignment({ tier: 'district_category', provinceSlug: 'canakkale', districtSlug: 'merkez', categoryId: 'spor' }, deps)).toEqual({
      ok: true, role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['merkez'], categoryIds: ['spor'] },
    })
    expect(buildAssignment({ tier: 'province_general', provinceSlug: 'antalya' }, deps)).toMatchObject({ ok: false, code: 'PROVINCE_NOT_ACTIVE' })
    expect(buildAssignment({ tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'alanya' }, deps)).toMatchObject({ ok: false, code: 'INVALID_DISTRICT' })
    expect(buildAssignment({ tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'ezine', categoryId: 'spor' }, deps)).toMatchObject({ ok: false, code: 'INVALID_SHAPE' })
    expect(buildAssignment({ tier: 'district_category', provinceSlug: 'canakkale', districtSlug: 'ezine', categoryId: 'nope' }, deps)).toMatchObject({ ok: false, code: 'INVALID_CATEGORY' })
  })
  it('super admin assigns any tier; never touches another super admin or itself', () => {
    expect(canAssign(superA, plain, { tier: 'province_general', provinceSlug: 'canakkale' }).ok).toBe(true)
    expect(canAssign(superA, id('s2', 'super_admin'), { tier: 'province_general', provinceSlug: 'canakkale' }).ok).toBe(false)
    expect(canAssign(superA, superA, { tier: 'province_general', provinceSlug: 'canakkale' }).ok).toBe(false)
  })
  it('province general editor assigns district tiers only in its own province, to users or own district editors', () => {
    const r = { tier: 'district_general' as const, provinceSlug: 'canakkale', districtSlug: 'ezine' }
    expect(canAssign(cnkGen, plain, r).ok).toBe(true)
    expect(canAssign(cnkGen, id('e', 'editor', merkezSpor), r).ok).toBe(true)
    expect(canAssign(cnkGen, plain, { tier: 'province_general', provinceSlug: 'canakkale' }).ok).toBe(false)
    expect(canAssign(antGen, plain, r).ok).toBe(false)
    // cannot capture global staff, another province's staff, or a peer province editor
    expect(canAssign(cnkGen, id('g', 'editor'), r)).toMatchObject({ ok: false, code: 'TARGET_OUT_OF_REACH' })
    expect(canAssign(cnkGen, id('x', 'editor', parse({ provinceSlugs: ['antalya'], districtSlugs: ['alanya'] })), r).ok).toBe(false)
    expect(canAssign(cnkGen, id('pg2', 'managing_editor', provGen), r).ok).toBe(false)
    expect(canAssign(cnkGen, cnkGen, r)).toMatchObject({ ok: false, code: 'SELF_ASSIGNMENT' })
  })
  it('district editors cannot assign anything', () => {
    expect(canAssign(id('d', 'editor', ezine), plain, { tier: 'district_category', provinceSlug: 'canakkale', districtSlug: 'ezine', categoryId: 'spor' }).ok).toBe(false)
  })
  it('revoke: super admin any scoped; province general only its district editors', () => {
    expect(canRevoke(superA, cnkGen).ok).toBe(true)
    expect(canRevoke(cnkGen, id('e', 'editor', ezine)).ok).toBe(true)
    expect(canRevoke(cnkGen, id('pg2', 'managing_editor', provGen)).ok).toBe(false)
    expect(canRevoke(antGen, id('e', 'editor', ezine)).ok).toBe(false)
    expect(canRevoke(superA, plain)).toMatchObject({ ok: false, code: 'NOT_SCOPED' })
  })
  it('who may manage a province staff list', () => {
    expect(canManageProvinceStaff(superA, 'canakkale')).toBe(true)
    expect(canManageProvinceStaff(cnkGen, 'canakkale')).toBe(true)
    expect(canManageProvinceStaff(cnkGen, 'antalya')).toBe(false)
    expect(canManageProvinceStaff(id('d', 'editor', ezine), 'canakkale')).toBe(false)
  })
})
