import { describe, expect, it } from 'vitest'
import {
  YEREL_SUBCATEGORY_IDS,
  YEREL_TO_NATIONAL_CATEGORY_MAP,
  getHomeFeedCategoryFamily,
  getCategoryFamily,
  getNationalCategoryForYerelSubcategory,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  isYerelHomepageExcluded,
} from '@/constants/config'

describe('yerel-duyuru', () => {
  it('is a yerel subcategory without national dual map', () => {
    expect(YEREL_SUBCATEGORY_IDS).toContain('yerel-duyuru')
    expect(YEREL_TO_NATIONAL_CATEGORY_MAP['yerel-duyuru']).toBeUndefined()
    expect(getNationalCategoryForYerelSubcategory('yerel-duyuru')).toBeNull()
  })

  it('appears in CMS yerel alt kategori picker (Turkish A–Z)', () => {
    const picker = getYerelSubcategories()
    const duyuru = picker.find((c) => c.id === 'yerel-duyuru')
    expect(duyuru).toBeTruthy()
    expect(getYerelSubcategoryShortLabel(duyuru!)).toBe('Duyuru')
    const labels = picker.map((c) => getYerelSubcategoryShortLabel(c))
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
    expect(labels).toEqual(sorted)
  })

  it('stays in yerel category family but is excluded from homepage yerel rail', () => {
    expect(getCategoryFamily('yerel-haber')).toContain('yerel-duyuru')
    expect(getHomeFeedCategoryFamily('yerel-haber')).not.toContain('yerel-duyuru')
    expect(getHomeFeedCategoryFamily('yerel-duyuru')).toEqual(['yerel-duyuru'])
    expect(isYerelHomepageExcluded('yerel-duyuru')).toBe(true)
  })
})
