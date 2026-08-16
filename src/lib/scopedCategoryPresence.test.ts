import { describe, expect, it } from 'vitest'
import {
  filterItemsWithPresence,
  filterThemedSectionIds,
  shouldHideEmptyScopedCategories,
} from '@/lib/scopedCategoryPresence'

describe('scopedCategoryPresence', () => {
  it('hides empty categories only on yerel and kıbrıs trees', () => {
    expect(shouldHideEmptyScopedCategories('kibris-haberleri')).toBe(true)
    expect(shouldHideEmptyScopedCategories('kibris-voleybol')).toBe(true)
    expect(shouldHideEmptyScopedCategories('yerel-haber')).toBe(true)
    expect(shouldHideEmptyScopedCategories('yerel-spor')).toBe(true)
    expect(shouldHideEmptyScopedCategories('spor')).toBe(false)
    expect(shouldHideEmptyScopedCategories('gundem')).toBe(false)
  })

  it('keeps only subcategories that have news, plus the current page', () => {
    const tabs = [
      { id: 'kibris-asayis' },
      { id: 'kibris-gundem' },
      { id: 'kibris-voleybol' },
    ]
    expect(filterItemsWithPresence(tabs, ['kibris-gundem']).map((t) => t.id)).toEqual([
      'kibris-gundem',
    ])
    expect(
      filterItemsWithPresence(tabs, ['kibris-gundem'], ['kibris-voleybol']).map((t) => t.id)
    ).toEqual(['kibris-gundem', 'kibris-voleybol'])
  })

  it('drops empty themed sections and keeps a dedicated empty subcategory page', () => {
    const sections = [
      'kibris-asayis',
      'kibris-voleybol',
      'kibris-hentbol',
      'kibris-haberleri',
    ]
    expect(
      filterThemedSectionIds(sections, ['kibris-asayis'], { currentCategoryId: 'kibris-haberleri' })
    ).toEqual(['kibris-asayis'])

    expect(
      filterThemedSectionIds(['kibris-voleybol'], [], { currentCategoryId: 'kibris-voleybol' })
    ).toEqual(['kibris-voleybol'])

    expect(
      filterThemedSectionIds(sections, [], { currentCategoryId: 'kibris-haberleri' })
    ).toEqual([])
  })
})
