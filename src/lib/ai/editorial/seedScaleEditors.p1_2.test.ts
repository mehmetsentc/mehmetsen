import { afterEach, describe, expect, it } from 'vitest'
import { pickAiEditorFromList } from '@/lib/ai/editorial/editorRouter'
import { buildCountryEditorSpec } from '@/lib/ai/editorial/seedCountryEditors'
import { buildDistrictEditorSpec } from '@/lib/ai/editorial/seedDistrictEditors'
import {
  DEFAULT_AI_CAPABILITIES,
  syntheticAiAuthorUid,
  type AiEditorDocument,
} from '@/types/aiEditor'
import type { SeedEditorSpec } from '@/lib/ai/editorial/seedEditors'
import { SEED_AI_EDITORS } from '@/lib/ai/editorial/seedEditors'
import { SEED_CITY_CATEGORY_AI_EDITORS } from '@/lib/ai/editorial/seedCityCategoryEditors'
import { SEED_CITY_AI_EDITORS } from '@/lib/ai/editorial/seedCityEditors'
import { allSeedEditorSpecs } from '@/lib/ai/editorial/aiEditorService'

function fakeEditor(
  partial: Partial<AiEditorDocument> & Pick<AiEditorDocument, 'id' | 'slug' | 'name'>
): AiEditorDocument {
  return {
    authorUid: syntheticAiAuthorUid(partial.slug),
    avatarUrl: null,
    coverUrl: null,
    title: 'Editör',
    shortBio: '',
    bio: '',
    columnName: null,
    primarySpecialization: 'Gündem',
    specializations: [],
    categoryIds: [],
    languages: ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES },
    publishPolicy: 'REQUIRES_APPROVAL',
    maxDailyNews: 20,
    maxDailyColumns: 1,
    maxDailyVideos: 0,
    modelAssignments: {},
    preferredSourceIds: [],
    allowedSourceIds: [],
    assignableForNews: true,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    joinDate: 1,
    lastActiveAt: null,
    createdBy: 'test',
    ...partial,
  }
}

function specToEditor(spec: SeedEditorSpec): AiEditorDocument {
  return fakeEditor({
    id: `id-${spec.slug}`,
    slug: spec.slug,
    name: spec.name,
    title: spec.title,
    personaType: spec.personaType,
    desk: spec.desk,
    categoryIds: spec.categoryIds,
    managedCategories: spec.managedCategories ?? spec.categoryIds,
    citySlug: spec.citySlug ?? null,
    countrySlug: spec.countrySlug ?? null,
    districtSlug: spec.districtSlug ?? null,
    editorLayer: spec.editorLayer,
    capabilities: { ...DEFAULT_AI_CAPABILITIES, ...spec.capabilities },
    assignableForNews: spec.assignableForNews !== false,
  })
}

function nationalRoster(): AiEditorDocument[] {
  return SEED_AI_EDITORS.filter((s) => s.assignableForNews !== false).map(specToEditor)
}

describe('AI-EDITOR-SCALE P1.2 leftover isolation', () => {
  afterEach(() => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
  })

  it('does not add ülke/ilçe specs to the live seed roster', () => {
    expect(allSeedEditorSpecs()).toHaveLength(31 + 81 + 20)
    expect(allSeedEditorSpecs().some((s) => s.slug === 'ulke-es')).toBe(false)
    expect(allSeedEditorSpecs().some((s) => s.slug === 'ilce-canakkale-biga')).toBe(false)
  })

  it('keeps Defne on dunya when a leftover ulke-es exists and the flag is off', () => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
    const leftover = specToEditor(
      buildCountryEditorSpec({ countryCode: 'ES', countryNameTr: 'İspanya' })
    )
    const editors = [...nationalRoster(), leftover]
    expect(pickAiEditorFromList(editors, { categoryId: 'dunya' })?.slug).toBe('defne-aksoy')
    expect(
      pickAiEditorFromList(editors, { categoryId: 'dunya', countrySlug: 'es' })?.slug
    ).toBe('defne-aksoy')
  })

  it('does not let leftover Biga steal Çanakkale city desks while the flag is off', () => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
    const sporDesk = SEED_CITY_CATEGORY_AI_EDITORS.find((s) => s.slug === 'yigit-anafarta')!
    const cityGeneral = SEED_CITY_AI_EDITORS.find((s) => s.slug === 'yerel-canakkale')!
    const leftover = specToEditor(
      buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'biga' })
    )
    const editors = [
      ...nationalRoster(),
      specToEditor(cityGeneral),
      specToEditor(sporDesk),
      leftover,
    ]
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'spor',
        citySlug: 'canakkale',
        districtSlug: 'biga',
      })?.slug
    ).toBe('yigit-anafarta')
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'yerel-haber',
        citySlug: 'canakkale',
        districtSlug: 'biga',
      })?.slug
    ).toBe('yerel-canakkale')
  })

  it('routes leftover specs only after the flag is on', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    const leftoverCountry = specToEditor(
      buildCountryEditorSpec({ countryCode: 'ES', countryNameTr: 'İspanya' })
    )
    const leftoverDistrict = specToEditor(
      buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'biga' })
    )
    const sporDesk = SEED_CITY_CATEGORY_AI_EDITORS.find((s) => s.slug === 'yigit-anafarta')!
    expect(
      pickAiEditorFromList([...nationalRoster(), leftoverCountry], {
        categoryId: 'dunya',
        countrySlug: 'es',
      })?.slug
    ).toBe('ulke-es')
    expect(
      pickAiEditorFromList(
        [...nationalRoster(), specToEditor(sporDesk), leftoverDistrict],
        { categoryId: 'yerel-haber', citySlug: 'canakkale', districtSlug: 'biga' }
      )?.slug
    ).toBe('ilce-canakkale-biga')
  })
})
