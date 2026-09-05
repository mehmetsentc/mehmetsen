/**
 * köşe (corner/column) ↔ Gümüşhane/Köse false friend + national-scope city wipe.
 */
import { describe, expect, it } from 'vitest'
import {
  extractDistrictSlugFromText,
  DISTRICT_TO_PROVINCE_SLUG,
} from '@/constants/cities'
import { hintCategoryFromText } from '@/lib/ai/editorial/categoryHint'
import { extractCityFromText, geoEngine } from '@/services/newsroom/geoEngine'
import { finalizeCanonicalArticleGeo } from '@/lib/geo/finalizeCanonicalArticleGeo'
import { applyCanonicalArticleGeoWrite } from '@/lib/geo/canonicalArticleGeoWrite'

const EDIRNE_OZGUR_OZEL = `Özgür Özel'den köprü ve otoyol özelleştirmelerine tepki: 'O otobanlar milletin olacak'
Yeni Parti Genel Başkanı Özgür Özel, Trakya ziyaretleri kapsamında Edirne'de Selimiye Camii ziyaretinin ardından Vefa Edirne Kafe'de emeklilerle bir araya geldi.`

describe('köşe → kose false district (Gümüşhane/Köse contamination)', () => {
  it('1. bad Evrensel fixture does NOT resolve gumushane/kose', () => {
    const withKoseSidebar = `${EDIRNE_OZGUR_OZEL}\nEvrensel köşe yazıları`
    expect(extractDistrictSlugFromText(withKoseSidebar)).not.toBe('kose')
    const hint = hintCategoryFromText(withKoseSidebar)
    expect(hint?.districtSlug).not.toBe('kose')
    expect(hint?.citySlug).not.toBe('gumushane')

    const enrich = geoEngine.enrich(
      {
        title: "Özgür Özel'den köprü ve otoyol özelleştirmelerine tepki",
        summary: withKoseSidebar,
        description: withKoseSidebar,
        content: withKoseSidebar,
        categoryId: 'siyaset',
        city: null,
        district: null,
        country: 'Türkiye',
        tags: [],
      } as never,
      [],
      { evidenceText: withKoseSidebar, categoryId: 'siyaset' }
    )
    expect(enrich.citySlug).not.toBe('gumushane')
    expect(enrich.districtSlug).not.toBe('kose')
    expect(enrich.tags).not.toContain('gumushane')
    expect(enrich.tags).not.toContain('kose')
  })

  it('2–3. Edirne evidence resolves Edirne; no unsupported district', () => {
    const city = extractCityFromText(EDIRNE_OZGUR_OZEL)
    expect(city?.toLocaleLowerCase('tr-TR')).toMatch(/edirne/i)
    const enrich = geoEngine.enrich(
      {
        title: "Özgür Özel'den köprü ve otoyol",
        summary: EDIRNE_OZGUR_OZEL,
        description: EDIRNE_OZGUR_OZEL,
        content: EDIRNE_OZGUR_OZEL,
        categoryId: 'siyaset',
        city: null,
        district: null,
        country: 'Türkiye',
        tags: [],
      } as never,
      [],
      { evidenceText: EDIRNE_OZGUR_OZEL, categoryId: 'siyaset' }
    )
    expect(enrich.citySlug).toBe('edirne')
    expect(enrich.districtSlug).toBe('')
  })

  it('4. legitimate Gümüşhane/Köse still resolves', () => {
    expect(extractDistrictSlugFromText("Mhp Köse'de Şerafettin")).toBe('kose')
    expect(extractDistrictSlugFromText('Köse ilçesinde seçim')).toBe('kose')
    expect(DISTRICT_TO_PROVINCE_SLUG.kose).toBe('gumushane')
    const enrich = geoEngine.enrich(
      {
        title: "Mhp Köse'de Şerafettin Kazancı yeniden ilçe başkanı seçildi",
        summary: "Gümüşhane'nin Köse ilçesinde kongre yapıldı",
        description: "Gümüşhane'nin Köse ilçesinde kongre yapıldı",
        content: "Gümüşhane'nin Köse ilçesinde kongre yapıldı",
        categoryId: 'yerel-siyaset',
        city: null,
        district: null,
        country: 'Türkiye',
        tags: [],
      } as never,
      [],
      {
        evidenceText: "Gümüşhane'nin Köse ilçesinde kongre yapıldı. Mhp Köse'de seçim.",
        categoryId: 'yerel-siyaset',
      }
    )
    expect(enrich.citySlug).toBe('gumushane')
    expect(enrich.districtSlug).toBe('kose')
  })

  it('köşe / Evrensel köşe must NOT resolve to district kose', () => {
    expect(extractDistrictSlugFromText('köşe yazarı açıkladı')).toBeNull()
    expect(extractDistrictSlugFromText('Köşe yazısında belirtildi')).toBeNull()
    expect(extractDistrictSlugFromText('Evrensel köşe')).toBeNull()
    expect(extractDistrictSlugFromText('masa köşesinde oturdu')).toBeNull()
  })

  it('5. NATIONAL politik wording does not wipe Edirne locative', () => {
    expect(extractCityFromText(EDIRNE_OZGUR_OZEL)?.toLocaleLowerCase('tr-TR')).toMatch(/edirne/i)
  })

  it('7–8. human editorial lock / clear preserved via write boundary', () => {
    const locked = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'gumushane', districtSlug: 'kose', city: 'Gümüşhane', district: 'Köse' },
      { editorialGeoLocked: true, rejectInvalidCompound: true }
    )
    expect(locked.ok && locked.state.canonicalGeoId).toBe('TR:gumushane:kose')

    const cleared = applyCanonicalArticleGeoWrite(
      {
        citySlug: 'gumushane',
        districtSlug: 'kose',
        canonicalGeoId: 'TR:gumushane:kose',
      },
      { city: '', citySlug: '', district: '', districtSlug: '' },
      { editorialGeoLocked: true }
    )
    expect(cleared.ok && cleared.state.canonicalGeoId).toBeNull()
  })

  it('9–12. Side/compound/Ankara atomic invariants unchanged', () => {
    const side = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'antalya',
      locality: 'Side',
      editorialGeoLocked: true,
      forcedCitySlug: 'antalya',
      forcedLocality: 'Side',
    })
    expect(side.canonicalGeoId).toBe('TR:antalya:manavgat')

    const ankara = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'ankara',
      districtSlug: 'cankaya',
      editorialGeoLocked: true,
      forcedCitySlug: 'ankara',
      forcedDistrict: 'Çankaya',
    })
    expect(ankara.canonicalGeoId).toBe('TR:ankara:cankaya')

    const bad = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'canakkale', districtSlug: 'gonen' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(bad.ok).toBe(false)
  })

  it('13. unrelated tags cannot force geo when evidence is Edirne', () => {
    const enrich = geoEngine.enrich(
      {
        title: "Özgür Özel Edirne'de",
        summary: EDIRNE_OZGUR_OZEL,
        description: EDIRNE_OZGUR_OZEL,
        content: EDIRNE_OZGUR_OZEL,
        categoryId: 'siyaset',
        city: 'Gümüşhane',
        district: 'Köse',
        country: 'Türkiye',
        tags: ['gumushane', 'kose', 'yerel-spor'],
      } as never,
      ['gumushane', 'kose'],
      { evidenceText: EDIRNE_OZGUR_OZEL, categoryId: 'siyaset' }
    )
    expect(enrich.citySlug).toBe('edirne')
    expect(enrich.districtSlug).toBe('')
  })
})
