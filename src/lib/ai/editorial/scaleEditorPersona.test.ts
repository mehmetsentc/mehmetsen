import { describe, expect, it } from 'vitest'
import { buildCountryEditorSpec, allWave3CountrySpecs } from '@/lib/ai/editorial/seedCountryEditors'
import { buildProvinceCategoryEditorSpec } from '@/lib/ai/editorial/seedProvinceCategoryEditors'
import { buildDistrictEditorSpec } from '@/lib/ai/editorial/seedDistrictEditors'
import {
  identityPatchForEditor,
  poolForCountry,
  scaleJournalistPersona,
} from '@/lib/ai/editorial/scaleEditorPersona'
import { SEED_CITY_AI_EDITORS } from '@/lib/ai/editorial/seedCityEditors'

describe('scale journalist personas', () => {
  it('gives ABD desks an American-style name, not "ABD Spor AI"', () => {
    const spec = buildCountryEditorSpec({
      worldSlug: 'abd',
      countryNameTr: 'ABD',
      category: 'spor',
    })
    expect(spec.slug).toBe('ulke-abd-spor')
    expect(spec.name).not.toMatch(/AI/)
    expect(spec.name).toMatch(/^\S+ \S+$/)
    expect(poolForCountry('abd').last).toContain('Brooks')
    expect(spec.avatarUrl).toContain('dicebear.com')
    expect(spec.coverUrl).toContain('dicebear.com')
    expect(spec.prompts.core).toContain(spec.name)
  })

  it('gives province desks a Turkish journalist name instead of "Amasya Spor AI"', () => {
    const spec = buildProvinceCategoryEditorSpec('amasya', 'spor')
    expect(spec.slug).toBe('il-amasya-spor')
    expect(spec.name).not.toMatch(/Amasya Spor AI/)
    expect(spec.name).not.toMatch(/ AI$/)
    expect(spec.title).toMatch(/Amasya/)
    expect(spec.avatarUrl).toBeTruthy()
    expect(spec.coverUrl).toBeTruthy()
  })

  it('gives district desks a person name while keeping ilce slug', () => {
    const spec = buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'biga' })
    expect(spec.slug).toBe('ilce-canakkale-biga')
    expect(spec.name).not.toMatch(/Biga/)
    expect(spec.name).not.toMatch(/ AI$/)
  })

  it('is deterministic for the same slug', () => {
    const a = scaleJournalistPersona({
      slug: 'ulke-abd-spor',
      deskLabel: 'ABD Spor',
      placeName: 'ABD',
      layer: 'country',
      countryKey: 'abd',
    })
    const b = scaleJournalistPersona({
      slug: 'ulke-abd-spor',
      deskLabel: 'ABD Spor',
      placeName: 'ABD',
      layer: 'country',
      countryKey: 'abd',
    })
    expect(a.name).toBe(b.name)
  })

  it('Wave 3 country names are unique enough and never factory "… AI" labels', () => {
    const specs = allWave3CountrySpecs()
    expect(specs.length).toBe(15 * 8)
    expect(specs.every((s) => !s.name.endsWith(' AI'))).toBe(true)
    expect(specs.every((s) => Boolean(s.avatarUrl && s.coverUrl))).toBe(true)
    const names = specs.map((s) => s.name)
    expect(new Set(names).size).toBeGreaterThan(specs.length * 0.9)
  })

  it('81 city local editors keep human names and now have portraits', () => {
    expect(SEED_CITY_AI_EDITORS.every((s) => !s.name.endsWith(' AI'))).toBe(true)
    expect(SEED_CITY_AI_EDITORS.every((s) => Boolean(s.avatarUrl && s.coverUrl))).toBe(true)
  })

  it('does not rename the 8 customized nationals', () => {
    const patch = identityPatchForEditor(
      {
        slug: 'selin-aras',
        name: 'Selin Aras',
        title: 'Genel Yayın AI Editörü',
        avatarUrl: null,
        coverUrl: null,
      },
      {
        name: 'Should Not Apply',
        title: 'x',
        shortBio: 'x',
        bio: 'x',
        avatarUrl: 'https://example.com/a.png',
        coverUrl: 'https://example.com/c.png',
      }
    )
    expect(patch?.name).toBeUndefined()
    expect(patch?.avatarUrl).toBeTruthy()
    expect(patch?.coverUrl).toBeTruthy()
  })

  it('renames factory country desks from the spec persona', () => {
    const spec = buildCountryEditorSpec({
      worldSlug: 'abd',
      countryNameTr: 'ABD',
      category: 'spor',
    })
    const patch = identityPatchForEditor(
      {
        slug: 'ulke-abd-spor',
        name: 'ABD Spor AI',
        title: 'ABD Spor AI Editörü',
        avatarUrl: null,
        coverUrl: null,
      },
      spec
    )
    expect(patch?.name).toBe(spec.name)
    expect(patch?.name).not.toMatch(/AI/)
    expect(patch?.avatarUrl).toContain('dicebear.com')
  })
})
