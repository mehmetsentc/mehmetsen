import { describe, expect, it } from 'vitest'
import {
  isLocalPrimaryScope,
  mergeNationalLocalTags,
  normalizePublishedLocalCategory,
  resolveCategoryForLocalVsNationalScope,
  resolveNationalLocalDualRouting,
} from '@/lib/news/nationalLocalCategoryRouting'

describe('isLocalPrimaryScope', () => {
  it('flags city-in-title topical local news', () => {
    expect(
      isLocalPrimaryScope("Van'da konut satışları Temmuz'da azaldı", '', 'van'),
    ).toBe(true)
    expect(
      isLocalPrimaryScope(
        "Van Gölü'nde Mavi Nefes seferberliği: 23 ton katı atık toplandı",
        'Van Gölü kıyılarında temizlik çalışması yapıldı.',
        'van',
      ),
    ).toBe(true)
    expect(
      isLocalPrimaryScope(
        "Yalova'da 'Sağlıklı Hayat Saatleri'nde Ayak Sağlığına Dikkat Çekildi",
        '',
        'yalova',
      ),
    ).toBe(true)
  })

  it('keeps national interest with location as non-local-primary', () => {
    expect(
      isLocalPrimaryScope(
        'Türkiye genelinde konut satışları arttı',
        'İstanbul lider oldu.',
        'istanbul',
      ),
    ).toBe(false)
    expect(
      isLocalPrimaryScope(
        'Sağlık Bakanlığı aşı takvimini açıkladı',
        'Bakanlık Ankara’da basın toplantısı yaptı.',
        'ankara',
      ),
    ).toBe(false)
  })
})

describe('resolveCategoryForLocalVsNationalScope', () => {
  it('maps national topical → yerel-* for local-primary city news', () => {
    expect(
      resolveCategoryForLocalVsNationalScope(
        'emlak-konut',
        "Van'da konut satışları Temmuz'da azaldı",
        '',
        'van',
      ),
    ).toBe('yerel-emlak')
    expect(
      resolveCategoryForLocalVsNationalScope(
        'cevre-iklim',
        "Van Gölü'nde atık toplandı",
        'katı atık seferberliği',
        'van',
      ),
    ).toBe('yerel-cevre-iklim')
    expect(
      resolveCategoryForLocalVsNationalScope(
        'saglik',
        "Yalova'da Sağlıklı Hayat Saatleri",
        '',
        'yalova',
      ),
    ).toBe('yerel-saglik')
  })

  it('keeps national category when not local-primary', () => {
    expect(
      resolveCategoryForLocalVsNationalScope(
        'emlak-konut',
        'Türkiye genelinde konut satışları arttı',
        'İstanbul öne çıktı',
        'istanbul',
      ),
    ).toBe('emlak-konut')
  })
})

describe('resolveNationalLocalDualRouting', () => {
  it('keeps yerel-emlak as yerel (no national remap)', () => {
    expect(resolveNationalLocalDualRouting('yerel-emlak', 'van')).toBeNull()
    expect(normalizePublishedLocalCategory('yerel-emlak', 'van', [])).toEqual({
      categoryId: 'yerel-emlak',
      tags: [],
    })
  })

  it('keeps yerel-magazin as yerel (no national remap)', () => {
    expect(resolveNationalLocalDualRouting('yerel-magazin', 'istanbul')).toBeNull()
  })

  it('keeps national magazin with citySlug and adds yerel-magazin tag', () => {
    const routing = resolveNationalLocalDualRouting('magazin', 'istanbul')
    expect(routing).toEqual({
      nationalCategoryId: 'magazin',
      yerelTag: 'yerel-magazin',
    })
  })

  it('keeps yerel-gundem as yerel-only (no national dual map)', () => {
    expect(resolveNationalLocalDualRouting('yerel-gundem', 'bursa')).toBeNull()
    expect(normalizePublishedLocalCategory('yerel-gundem', 'bursa', [])).toEqual({
      categoryId: 'yerel-gundem',
      tags: [],
    })
  })

  it('can tag national gundem + citySlug with yerel-gundem without remapping category', () => {
    expect(resolveNationalLocalDualRouting('gundem', 'bursa')).toEqual({
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

  it('keeps yerel-futbol as yerel (no national remap)', () => {
    expect(resolveNationalLocalDualRouting('yerel-futbol', 'canakkale')).toBeNull()
    expect(normalizePublishedLocalCategory('yerel-basketbol', 'canakkale', [])).toEqual({
      categoryId: 'yerel-basketbol',
      tags: [],
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
  it('keeps yerel-magazin for manual publish', () => {
    expect(normalizePublishedLocalCategory('yerel-magazin', 'istanbul', [])).toEqual({
      categoryId: 'yerel-magazin',
      tags: [],
    })
  })

  it('local-primary title remaps national topical on publish', () => {
    expect(
      normalizePublishedLocalCategory('emlak-konut', 'van', [], {
        title: "Van'da konut satışları Temmuz'da azaldı",
      }),
    ).toEqual({
      categoryId: 'yerel-emlak',
      tags: [],
    })
  })
})
