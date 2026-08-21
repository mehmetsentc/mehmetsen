import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  YEREL_SUBCATEGORY_IDS,
  YEREL_TO_NATIONAL_CATEGORY_MAP,
  getCategoryFamily,
  getHomeFeedCategoryFamily,
  getNationalCategoryForYerelSubcategory,
  getSporSubcategories,
  getYerelSporSubcategories,
  getYerelSubcategories,
  isNationalSporCategory,
  isYerelSporCategory,
  mapNationalCategoryToYerelSubcategory,
} from '@/constants/config'

const YEREL_SPOR_BRANCH_IDS = [
  'yerel-futbol',
  'yerel-basketbol',
  'yerel-voleybol',
  'yerel-hentbol',
  'yerel-atletizm',
  'yerel-gures',
  'yerel-tenis',
  'yerel-karate',
  'yerel-yuzme',
  'yerel-motor-sporlari',
] as const

describe('yerel spor alt kategorileri', () => {
  it('registers branch ids under yerel-haber with national dual maps', () => {
    for (const id of YEREL_SPOR_BRANCH_IDS) {
      expect(YEREL_SUBCATEGORY_IDS).toContain(id)
      expect(DEFAULT_CATEGORIES.find((c) => c.id === id)?.parentId).toBe('yerel-haber')
      expect(getYerelSubcategories().some((c) => c.id === id)).toBe(true)
      expect(YEREL_TO_NATIONAL_CATEGORY_MAP[id]).toBeTruthy()
    }
  })

  it('lists spor branches as CMS yerel alt kategori siblings (with Spor)', () => {
    const pickerIds = getYerelSubcategories().map((c) => c.id)
    expect(pickerIds).toContain('yerel-spor')
    for (const id of YEREL_SPOR_BRANCH_IDS) {
      expect(pickerIds).toContain(id)
    }
  })

  it('maps national sport branches to matching yerel ids', () => {
    expect(mapNationalCategoryToYerelSubcategory('futbol')).toBe('yerel-futbol')
    expect(mapNationalCategoryToYerelSubcategory('basketbol')).toBe('yerel-basketbol')
    expect(mapNationalCategoryToYerelSubcategory('voleybol')).toBe('yerel-voleybol')
    expect(mapNationalCategoryToYerelSubcategory('hentbol')).toBe('yerel-hentbol')
    expect(mapNationalCategoryToYerelSubcategory('atletizm')).toBe('yerel-atletizm')
    expect(mapNationalCategoryToYerelSubcategory('gures')).toBe('yerel-gures')
    expect(mapNationalCategoryToYerelSubcategory('tenis')).toBe('yerel-tenis')
    expect(mapNationalCategoryToYerelSubcategory('karate')).toBe('yerel-karate')
    expect(getNationalCategoryForYerelSubcategory('yerel-futbol')).toBe('futbol')
    expect(getNationalCategoryForYerelSubcategory('yerel-tenis')).toBe('tenis')
    expect(getNationalCategoryForYerelSubcategory('yerel-karate')).toBe('karate')
    expect(getNationalCategoryForYerelSubcategory('yerel-yuzme')).toBe('spor')
    expect(getNationalCategoryForYerelSubcategory('yerel-motor-sporlari')).toBe('spor')
  })

  it('keeps spor homepage family ≤10 with national children first', () => {
    const home = getHomeFeedCategoryFamily('spor')
    expect(home.length).toBeLessThanOrEqual(10)
    expect(home[0]).toBe('spor')
    expect(home).toContain('futbol')
    expect(home).toContain('basketbol')
    expect(home).not.toContain('yerel-spor')
    expect(getCategoryFamily('spor')).toEqual(
      expect.arrayContaining(['yerel-spor', 'yerel-futbol', 'yerel-basketbol'])
    )
  })

  it('city spor family includes yerel mirrors dropped by homepage truncation', () => {
    const city = getCategoryFamily('spor')
    const home = getHomeFeedCategoryFamily('spor')
    expect(city).toContain('yerel-spor')
    expect(city).toContain('yerel-futbol')
    expect(city).toContain('yerel-yuzme')
    expect(city.length).toBeGreaterThan(home.length)
    // Homepage truncation is why city feeds must use getCategoryFamily, not home.
    expect(home).not.toContain('yerel-spor')
  })

  it('includes yerel sport branches in spor category family for presence', () => {
    const family = getCategoryFamily('spor')
    for (const id of YEREL_SPOR_BRANCH_IDS) {
      expect(family).toContain(id)
    }
  })

  it('orders national and yerel sport chips for admin filters', () => {
    const nationalIds = getSporSubcategories().map((c) => c.id)
    expect(nationalIds.slice(0, 7)).toEqual([
      'futbol',
      'basketbol',
      'voleybol',
      'hentbol',
      'gures',
      'tenis',
      'karate',
    ])
    expect(isNationalSporCategory('futbol')).toBe(true)
    expect(isNationalSporCategory('gundem')).toBe(false)
    const yerelIds = getYerelSporSubcategories().map((c) => c.id)
    expect(yerelIds[0]).toBe('yerel-spor')
    expect(yerelIds).toContain('yerel-futbol')
    expect(yerelIds).toContain('yerel-karate')
    expect(isYerelSporCategory('yerel-futbol')).toBe(true)
    expect(isYerelSporCategory('yerel-asayis')).toBe(false)
  })
})
