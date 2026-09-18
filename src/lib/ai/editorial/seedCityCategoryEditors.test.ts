import { describe, expect, it } from 'vitest'
import { SEED_AI_EDITORS } from '@/lib/ai/editorial/seedEditors'
import { SEED_CITY_AI_EDITORS } from '@/lib/ai/editorial/seedCityEditors'
import {
  CITY_CATEGORY_DESK_CITIES,
  CITY_CATEGORY_DESK_IDS,
  findCityCategoryEditorSpec,
  SEED_CITY_CATEGORY_AI_EDITORS,
} from '@/lib/ai/editorial/seedCityCategoryEditors'

describe('seedCityCategoryEditors', () => {
  it('creates one named desk per category for Çanakkale and Antalya', () => {
    expect(SEED_CITY_CATEGORY_AI_EDITORS).toHaveLength(
      CITY_CATEGORY_DESK_CITIES.length * CITY_CATEGORY_DESK_IDS.length
    )
    for (const city of CITY_CATEGORY_DESK_CITIES) {
      for (const desk of CITY_CATEGORY_DESK_IDS) {
        const editor = findCityCategoryEditorSpec(city, desk)
        expect(editor, `${city}/${desk}`).toBeTruthy()
        expect(editor?.citySlug).toBe(city)
        expect(editor?.name.split(' ').length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('keeps slugs and names unique against national and city seeds', () => {
    const slugs = [
      ...SEED_AI_EDITORS.map((s) => s.slug),
      ...SEED_CITY_AI_EDITORS.map((s) => s.slug),
      ...SEED_CITY_CATEGORY_AI_EDITORS.map((s) => s.slug),
    ]
    const names = [
      ...SEED_AI_EDITORS.map((s) => s.name),
      ...SEED_CITY_AI_EDITORS.map((s) => s.name),
      ...SEED_CITY_CATEGORY_AI_EDITORS.map((s) => s.name),
    ]
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('maps sport children onto the city sport desk', () => {
    expect(findCityCategoryEditorSpec('canakkale', 'futbol')?.slug).toBe('yigit-anafarta')
    expect(findCityCategoryEditorSpec('antalya', 'basketbol')?.slug).toBe('bora-alanya')
  })
})
