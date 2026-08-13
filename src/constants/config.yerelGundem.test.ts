import { describe, expect, it } from 'vitest'
import {
  YEREL_SUBCATEGORY_IDS,
  YEREL_TO_NATIONAL_CATEGORY_MAP,
  getCategoryFamily,
  getHomeFeedCategoryFamily,
  getNationalCategoryForYerelSubcategory,
  mapNationalCategoryToYerelSubcategory,
} from '@/constants/config'

describe('yerel-gundem national isolation', () => {
  it('is a yerel subcategory without national dual map', () => {
    expect(YEREL_SUBCATEGORY_IDS).toContain('yerel-gundem')
    expect(YEREL_TO_NATIONAL_CATEGORY_MAP['yerel-gundem']).toBeUndefined()
    expect(getNationalCategoryForYerelSubcategory('yerel-gundem')).toBeNull()
  })

  it('still localizes national gundem → yerel-gundem one-way', () => {
    expect(mapNationalCategoryToYerelSubcategory('gundem')).toBe('yerel-gundem')
  })

  it('stays in yerel family but is excluded from national gundem category queries', () => {
    expect(getCategoryFamily('yerel-haber')).toContain('yerel-gundem')
    expect(getHomeFeedCategoryFamily('yerel-gundem')).toEqual(['yerel-gundem'])
    expect(getCategoryFamily('gundem')).not.toContain('yerel-gundem')
    expect(getHomeFeedCategoryFamily('gundem')).not.toContain('yerel-gundem')
    expect(getHomeFeedCategoryFamily('gundem')).toEqual(['gundem'])
  })
})
