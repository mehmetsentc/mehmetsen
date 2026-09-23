import { describe, expect, it, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickAiEditorFromList } from '@/lib/ai/editorial/editorRouter'
import { allSeedEditorSpecs } from '@/lib/ai/editorial/aiEditorService'
import {
  buildCountryEditorSpec,
  SCALE_P1_1_COUNTRY_DRYRUN,
} from '@/lib/ai/editorial/seedCountryEditors'
import {
  buildDistrictEditorSpec,
  SCALE_P1_1_DISTRICT_DRYRUN,
} from '@/lib/ai/editorial/seedDistrictEditors'
import { inferEditorLayer } from '@/lib/ai/editorial/editorHierarchy'
import {
  DEFAULT_AI_CAPABILITIES,
  syntheticAiAuthorUid,
  type AiEditorDocument,
} from '@/types/aiEditor'
import type { SeedEditorSpec } from '@/lib/ai/editorial/seedEditors'
import { SEED_AI_EDITORS } from '@/lib/ai/editorial/seedEditors'
import { SEED_CITY_CATEGORY_AI_EDITORS } from '@/lib/ai/editorial/seedCityCategoryEditors'

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

function promptChars(spec: SeedEditorSpec): number {
  return Object.values(spec.prompts)
    .filter(Boolean)
    .join('\n')
    .length
}

describe('AI-EDITOR-SCALE P1.1 templates', () => {
  afterEach(() => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
  })

  it('does not add ülke/ilçe specs to the live seed roster', () => {
    const slugs = allSeedEditorSpecs().map((s) => s.slug)
    expect(slugs.some((s) => s.startsWith('ulke-'))).toBe(false)
    expect(slugs.some((s) => s.startsWith('ilce-'))).toBe(false)
    expect(allSeedEditorSpecs()).toHaveLength(31 + 81 + 20)
  })

  it('builds 3 country dry-run specs with parametric slugs', () => {
    const specs = SCALE_P1_1_COUNTRY_DRYRUN.map(buildCountryEditorSpec)
    expect(specs.map((s) => s.slug)).toEqual(['ulke-es', 'ulke-de-politika', 'ulke-us-spor'])
    expect(specs.every((s) => s.editorLayer === 'country')).toBe(true)
    expect(specs[0]?.fallbackEditorSlug).toBe('defne-aksoy')
    expect(specs[1]?.fallbackEditorSlug).toBe('ulke-de')
  })

  it('rejects non ISO-2 country codes', () => {
    expect(() => buildCountryEditorSpec({ countryCode: 'ESP', countryNameTr: 'İspanya' })).toThrow(
      /ISO-2/
    )
  })

  it('builds 3 Çanakkale district dry-run specs from turkishDistricts.ts', () => {
    const specs = SCALE_P1_1_DISTRICT_DRYRUN.map(buildDistrictEditorSpec)
    expect(specs.map((s) => s.slug)).toEqual([
      'ilce-canakkale-biga',
      'ilce-canakkale-gelibolu-spor',
      'ilce-canakkale-merkez-gundem',
    ])
    expect(specs.every((s) => s.editorLayer === 'district')).toBe(true)
    expect(specs[0]?.fallbackEditorSlug).toBe('yerel-canakkale')
    expect(specs[1]?.fallbackEditorSlug).toBe('ilce-canakkale-gelibolu')
  })

  it('rejects unknown districts', () => {
    expect(() =>
      buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'yokilce' })
    ).toThrow(/ilçe yok/)
  })

  it('keeps production city-desk routing when the expanded flag is off', () => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
    const sporDesk = SEED_CITY_CATEGORY_AI_EDITORS.find((s) => s.slug === 'yigit-anafarta')!
    const editors = [
      ...nationalRoster(),
      specToEditor(sporDesk),
      specToEditor(buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'biga' })),
    ]
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'spor',
        citySlug: 'canakkale',
        districtSlug: 'biga',
      })?.slug
    ).toBe('yigit-anafarta')
  })

  it('uses ilçe-kategori → ilçe-genel → il-kategori when the flag is on', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    const sporDesk = SEED_CITY_CATEGORY_AI_EDITORS.find((s) => s.slug === 'yigit-anafarta')!
    const districtGeneral = buildDistrictEditorSpec({
      provinceSlug: 'canakkale',
      districtSlug: 'gelibolu',
    })
    const districtSport = buildDistrictEditorSpec({
      provinceSlug: 'canakkale',
      districtSlug: 'gelibolu',
      category: 'spor',
    })
    const editors = [
      ...nationalRoster(),
      specToEditor(sporDesk),
      specToEditor(districtGeneral),
      specToEditor(districtSport),
    ]
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'spor',
        citySlug: 'canakkale',
        districtSlug: 'gelibolu',
      })?.slug
    ).toBe('ilce-canakkale-gelibolu-spor')
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'yerel-haber',
        citySlug: 'canakkale',
        districtSlug: 'gelibolu',
      })?.slug
    ).toBe('ilce-canakkale-gelibolu')
  })

  it('uses ülke-kategori → ülke-genel → Defne when the flag is on', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    const general = buildCountryEditorSpec({ countryCode: 'ES', countryNameTr: 'İspanya' })
    const politika = buildCountryEditorSpec({
      countryCode: 'ES',
      countryNameTr: 'İspanya',
      category: 'politika',
    })
    const editors = [...nationalRoster(), specToEditor(general), specToEditor(politika)]
    expect(
      pickAiEditorFromList(editors, { categoryId: 'siyaset', countrySlug: 'es' })?.slug
    ).toBe('ulke-es-politika')
    expect(pickAiEditorFromList(editors, { countrySlug: 'es', categoryId: 'dunya' })?.slug).toBe(
      'ulke-es'
    )
  })

  it('emits dry-run prompt pack (no Firestore, no AI call)', () => {
    const countries = SCALE_P1_1_COUNTRY_DRYRUN.map(buildCountryEditorSpec)
    const districts = SCALE_P1_1_DISTRICT_DRYRUN.map(buildDistrictEditorSpec)
    const all = [...countries, ...districts]
    const lines: string[] = [
      '# AI-EDITOR-SCALE P1.1 dry-run prompt pack',
      '',
      'Firestore yazımı yok. DeepSeek çağrısı yok. Seed roster’a eklenmedi.',
      '',
    ]
    for (const spec of all) {
      const chars = promptChars(spec)
      const estTokens = Math.ceil(chars / 4)
      lines.push(`## ${spec.slug}`)
      lines.push('')
      lines.push(`- layer: ${spec.editorLayer}`)
      lines.push(`- title: ${spec.title}`)
      lines.push(`- fallback: ${spec.fallbackEditorSlug}`)
      lines.push(`- prompt chars: ${chars}`)
      lines.push(`- estimated tokens (chars/4): ${estTokens}`)
      lines.push('')
      lines.push('### core')
      lines.push('')
      lines.push('```')
      lines.push(spec.prompts.core ?? '')
      lines.push('```')
      lines.push('')
      lines.push('### news')
      lines.push('')
      lines.push('```')
      lines.push(spec.prompts.news ?? '')
      lines.push('```')
      lines.push('')
    }
    const body = lines.join('\n')
    writeFileSync(
      join(process.cwd(), 'scripts/_ai_editor_scale_p1_1_dryrun_output.md'),
      body,
      'utf8'
    )
    expect(all).toHaveLength(6)
    expect(inferEditorLayer(specToEditor(countries[0]!))).toBe('country')
    expect(charsOrTokens(all).maxChars).toBeGreaterThan(500)
  })
})

function charsOrTokens(specs: SeedEditorSpec[]): { maxChars: number; avgEstTokens: number } {
  const lengths = specs.map(promptChars)
  return {
    maxChars: Math.max(...lengths),
    avgEstTokens: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length / 4),
  }
}
