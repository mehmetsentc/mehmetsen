import { describe, expect, it } from 'vitest'
import {
  mergeNationalLocalTags,
  normalizePublishedLocalCategory,
  resolveNationalLocalDualRouting,
} from '@/lib/news/nationalLocalCategoryRouting'

describe('resolveNationalLocalDualRouting', () => {
  it('maps yerel-magazin to national magazin with yerel tag', () => {
    const routing = resolveNationalLocalDualRouting('yerel-magazin', 'istanbul')
    expect(routing).toEqual({
      nationalCategoryId: 'magazin',
      yerelTag: 'yerel-magazin',
    })
  })

  it('keeps national magazin with citySlug and adds yerel-magazin tag', () => {
    const routing = resolveNationalLocalDualRouting('magazin', 'istanbul')
    expect(routing).toEqual({
      nationalCategoryId: 'magazin',
      yerelTag: 'yerel-magazin',
    })
  })

  it('maps yerel-gundem to gundem', () => {
    expect(resolveNationalLocalDualRouting('yerel-gundem', 'bursa')).toEqual({
      nationalCategoryId: 'gundem',
      yerelTag: 'yerel-gundem',
    })
  })

  it('requires citySlug', () => {
    expect(resolveNationalLocalDualRouting('yerel-magazin', null)).toBeNull()
    expect(resolveNationalLocalDualRouting('magazin', '')).toBeNull()
  })

  it('skips abroad and non-localizable categories', () => {
    expect(resolveNationalLocalDualRouting('dunya', 'istanbul', true)).toBeNull()
    expect(resolveNationalLocalDualRouting('dunya', 'istanbul')).toBeNull()
  })

  it('skips generic yerel-haber without subcategory mapping', () => {
    expect(resolveNationalLocalDualRouting('yerel-haber', 'istanbul')).toBeNull()
  })

  it('keeps yerel-duyuru as yerel-only (no national dual map)', () => {
    expect(resolveNationalLocalDualRouting('yerel-duyuru', 'canakkale')).toBeNull()
    expect(normalizePublishedLocalCategory('yerel-duyuru', 'canakkale', [])).toEqual({
      categoryId: 'yerel-duyuru',
      tags: [],
    })
  })

  it('maps yerel-futbol to national futbol with yerel tag', () => {
    expect(resolveNationalLocalDualRouting('yerel-futbol', 'canakkale')).toEqual({
      nationalCategoryId: 'futbol',
      yerelTag: 'yerel-futbol',
    })
    expect(normalizePublishedLocalCategory('yerel-basketbol', 'canakkale', [])).toEqual({
      categoryId: 'basketbol',
      tags: ['yerel-basketbol'],
    })
  })

  it('maps national futbol + citySlug to yerel-futbol tag', () => {
    expect(resolveNationalLocalDualRouting('futbol', 'canakkale')).toEqual({
      nationalCategoryId: 'futbol',
      yerelTag: 'yerel-futbol',
    })
  })
})

describe('mergeNationalLocalTags', () => {
  it('adds tag once', () => {
    expect(mergeNationalLocalTags(['foo'], 'yerel-magazin')).toEqual([
      'foo',
      'yerel-magazin',
    ])
    expect(mergeNationalLocalTags(['yerel-magazin'], 'yerel-magazin')).toEqual([
      'yerel-magazin',
    ])
  })
})

describe('normalizePublishedLocalCategory', () => {
  it('normalizes yerel-magazin for manual publish', () => {
    expect(normalizePublishedLocalCategory('yerel-magazin', 'istanbul', [])).toEqual({
      categoryId: 'magazin',
      tags: ['yerel-magazin'],
    })
  })
})
