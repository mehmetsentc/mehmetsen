import { describe, expect, it } from 'vitest'
import {
  KIBRIS_SUBCATEGORY_IDS,
  YEREL_SUBCATEGORY_IDS,
  getAdminCategoryGroups,
  getKibrisSubcategories,
  getKibrisSubcategoryShortLabel,
  getSubcategories,
  isKibrisCategoryTree,
  composeKibrisCategoryId,
  resolveKibrisCategoryParts,
  KIBRIS_HABERLERI_CATEGORY_ID,
} from '@/constants/config'

describe('kibris subcategories', () => {
  it('mirrors yerel topic suffixes under kibris-haberleri', () => {
    const yerelSuffixes = YEREL_SUBCATEGORY_IDS.map((id) => id.replace(/^yerel-/, ''))
    const kibrisSuffixes = KIBRIS_SUBCATEGORY_IDS.map((id) => id.replace(/^kibris-/, ''))
    expect(kibrisSuffixes).toEqual(yerelSuffixes)
    for (const id of KIBRIS_SUBCATEGORY_IDS) {
      expect(getSubcategories(KIBRIS_HABERLERI_CATEGORY_ID).some((c) => c.id === id)).toBe(true)
    }
  })

  it('shows Kıbrıs alt kategori picker sorted by Turkish short label', () => {
    const picker = getKibrisSubcategories()
    expect(picker.find((c) => c.id === 'kibris-duyuru')).toBeTruthy()
    expect(picker.find((c) => c.id === 'kibris-siyaset')).toBeTruthy()
    const labels = picker.map((c) => getKibrisSubcategoryShortLabel(c))
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
    expect(labels).toEqual(sorted)
    expect(getKibrisSubcategoryShortLabel(picker.find((c) => c.id === 'kibris-asayis')!)).toBe('Asayiş')
  })

  it('admin main picker keeps only Kıbrıs parent (subs via alt dropdown)', () => {
    const genel = getAdminCategoryGroups().find((g) => g.label === 'Genel')
    const ids = genel?.categories.map((c) => c.id) ?? []
    expect(ids).toContain(KIBRIS_HABERLERI_CATEGORY_ID)
    expect(ids.some((id) => id.startsWith('kibris-') && id !== KIBRIS_HABERLERI_CATEGORY_ID)).toBe(false)
  })

  it('resolve/compose round-trip', () => {
    expect(isKibrisCategoryTree('kibris-spor')).toBe(true)
    expect(resolveKibrisCategoryParts('kibris-spor')).toEqual({
      parentId: KIBRIS_HABERLERI_CATEGORY_ID,
      subcategoryId: 'kibris-spor',
    })
    expect(composeKibrisCategoryId(null)).toBe(KIBRIS_HABERLERI_CATEGORY_ID)
    expect(composeKibrisCategoryId('kibris-futbol')).toBe('kibris-futbol')
  })
})
