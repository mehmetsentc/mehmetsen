import { describe, expect, it } from 'vitest'
import { allStaffRights, canAccessContentScope, hasStaffRight, parseStaffScope, staffTierOf } from '@/lib/cms/rbacScope'
import { requiredRightsForCreate, requiredRightsForUpdate } from '@/lib/cms/staffRights'
import { buildSections, canSetSections, type HierarchyDeps } from '@/lib/cms/staffHierarchy'
import { canManageAd, forcedAdTarget } from '@/lib/cms/adScope'
import { isDistrictOfProvince } from '@/lib/cmsAuthServer'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'

const isProv = (s: string) => isTurkishProvinceSlug(s) && normalizeCitySlug(s) === s
const parse = (raw: unknown) => parseStaffScope(raw, isProv, isDistrictOfProvince)
const deps: HierarchyDeps = { isProvinceSlug: isProv, isDistrictOfProvince, isKnownCategory: (c) => ['spor', 'gundem', 'ekonomi'].includes(c) }

// Ezine (genel) with edit+info, Biga spor with everything, Merkez ekonomi with no rights yet
const multi = parse({
  provinceSlugs: ['canakkale'],
  sections: [
    { districtSlug: 'ezine', categoryId: null, rights: ['edit', 'info'] },
    { districtSlug: 'biga', categoryId: 'spor', rights: ['create', 'edit', 'info', 'media', 'publish', 'ads'] },
    { districtSlug: 'merkez', categoryId: 'ekonomi', rights: [] },
  ],
})
const at = (districtSlug: string, categoryId: string) => ({ citySlug: 'canakkale', districtSlug, categoryId })

describe('sections: several areas in one il, rights per area', () => {
  it('parses as section_editor and sees every own area (even with no rights)', () => {
    expect(staffTierOf(multi)).toBe('section_editor')
    expect(canAccessContentScope(multi, at('ezine', 'gundem'))).toBe(true)
    expect(canAccessContentScope(multi, at('biga', 'spor'))).toBe(true)
    expect(canAccessContentScope(multi, at('merkez', 'ekonomi'))).toBe(true)
    expect(canAccessContentScope(multi, at('biga', 'gundem'))).toBe(false)
    expect(canAccessContentScope(multi, at('', 'gundem'))).toBe(false)
    expect(canAccessContentScope(multi, { citySlug: 'aksaray', districtSlug: 'merkez', categoryId: 'ekonomi' })).toBe(false)
  })
  it('rights are per area', () => {
    expect(hasStaffRight(multi, at('ezine', 'gundem'), 'edit')).toBe(true)
    expect(hasStaffRight(multi, at('ezine', 'gundem'), 'publish')).toBe(false)
    expect(hasStaffRight(multi, at('biga', 'spor'), 'publish')).toBe(true)
    expect(hasStaffRight(multi, at('merkez', 'ekonomi'), 'edit')).toBe(false)
    expect(allStaffRights(multi).sort()).toEqual(['ads', 'create', 'edit', 'info', 'media', 'publish'])
  })
  it('legacy shapes keep every right in scope', () => {
    const prov = parse({ provinceSlugs: ['canakkale'] })
    expect(hasStaffRight(prov, at('', 'gundem'), 'publish')).toBe(true)
    expect(hasStaffRight(prov, { citySlug: 'antalya' }, 'publish')).toBe(false)
  })
  it('rejects malformed sections fail-closed', () => {
    expect(parse({ provinceSlugs: ['canakkale'], sections: [] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale'], sections: [{ districtSlug: null, categoryId: null, rights: [] }] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale'], sections: [{ districtSlug: 'alanya', categoryId: null, rights: [] }] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale'], sections: [{ districtSlug: 'ezine', categoryId: null, rights: ['superpower'] }] }).kind).toBe('invalid')
    expect(parse({ provinceSlugs: ['canakkale', 'antalya'], sections: [{ districtSlug: 'ezine', categoryId: null, rights: [] }] }).kind).toBe('invalid')
  })
})

describe('which rights an edit needs', () => {
  const stored = { title: 'A', content: 'gövde', summary: 'ö', tags: ['x'], thumbnail: 'https://i/1.jpg', status: 'draft', citySlug: 'canakkale' }
  it('only CHANGED fields count (editor resends everything)', () => {
    expect([...requiredRightsForUpdate({ ...stored, title: 'B' }, stored)]).toEqual(['edit'])
    expect([...requiredRightsForUpdate({ ...stored, tags: ['x', 'y'] }, stored)]).toEqual(['info'])
    expect([...requiredRightsForUpdate({ ...stored, thumbnail: 'https://i/2.jpg' }, stored)]).toEqual(['media'])
    expect([...requiredRightsForUpdate({ ...stored, status: 'published' }, stored)]).toEqual(['publish'])
    expect([...requiredRightsForUpdate({ ...stored }, stored)]).toEqual([])
    expect([...requiredRightsForUpdate({ weirdField: 1 }, stored)]).toEqual(['edit'])
  })
  it('create needs create (+ media / publish when used)', () => {
    expect([...requiredRightsForCreate({ title: 'A', status: 'pending', thumbnail: '' })]).toEqual(['create'])
    expect([...requiredRightsForCreate({ title: 'A', status: 'published', thumbnail: 'https://i/1.jpg' })].sort()).toEqual(['create', 'media', 'publish'])
  })
})

describe('assigning sections', () => {
  const superA = { uid: 's', role: 'super_admin' as const, scope: { kind: 'unscoped' as const } }
  const cnkGen = { uid: 'pg', role: 'managing_editor' as const, scope: parse({ provinceSlugs: ['canakkale'] }) }
  const plain = { uid: 'u', role: 'user' as const, scope: { kind: 'unscoped' as const } }
  it('builds rights one by one; no rights by default', () => {
    const r = buildSections('canakkale', [{ districtSlug: 'ezine', categoryId: '', rights: [] }, { districtSlug: 'biga', categoryId: 'spor', rights: ['publish', 'edit'] }], deps)
    expect(r).toEqual({
      ok: true,
      role: 'editor',
      cmsScope: { provinceSlugs: ['canakkale'], sections: [
        { districtSlug: 'ezine', categoryId: null, rights: [] },
        { districtSlug: 'biga', categoryId: 'spor', rights: ['edit', 'publish'] },
      ] },
    })
  })
  it('one il only; il-wide category section allowed; whole-il section is not a section', () => {
    expect(buildSections('canakkale', [{ districtSlug: null, categoryId: 'spor', rights: [] }], deps).ok).toBe(true)
    expect(buildSections('canakkale', [{ districtSlug: null, categoryId: null, rights: [] }], deps).ok).toBe(false)
    expect(buildSections('canakkale', [{ districtSlug: 'alanya', categoryId: null, rights: [] }], deps).ok).toBe(false)
    expect(buildSections('antalya', [{ districtSlug: 'alanya', categoryId: null, rights: [] }], deps)).toMatchObject({ code: 'PROVINCE_NOT_ACTIVE' })
  })
  it('il genel editörü edits section editors of its il; others cannot', () => {
    expect(canSetSections(cnkGen, plain, 'canakkale').ok).toBe(true)
    expect(canSetSections(cnkGen, { uid: 'm', role: 'editor', scope: multi }, 'canakkale').ok).toBe(true)
    expect(canSetSections(cnkGen, plain, 'antalya').ok).toBe(false)
    expect(canSetSections({ uid: 'm', role: 'editor', scope: multi }, plain, 'canakkale').ok).toBe(false)
    expect(canSetSections(superA, plain, 'canakkale').ok).toBe(true)
  })
})

describe('ads follow the ads right per area', () => {
  const actor = { role: 'editor' as const, scope: multi }
  it('only areas with the ads right', () => {
    expect(canManageAd(actor, { provinceSlug: 'canakkale', districtSlug: 'biga' })).toBe(true)
    expect(canManageAd(actor, { provinceSlug: 'canakkale', districtSlug: 'ezine' })).toBe(false)
    expect(canManageAd(actor, { provinceSlug: 'canakkale', districtSlug: null })).toBe(false)
    expect(forcedAdTarget(actor, null, isDistrictOfProvince)).toEqual({ ok: true, provinceSlug: 'canakkale', districtSlug: 'biga' })
    expect(forcedAdTarget(actor, 'ezine', isDistrictOfProvince).ok).toBe(false)
  })
})
