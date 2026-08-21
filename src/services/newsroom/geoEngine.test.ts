import { describe, expect, it } from 'vitest'
import { extractDistrictSlugFromText } from '@/constants/cities'
import { resolveCountryFromText } from '@/constants/countries'
import { enrichGeo, extractCityFromText, hasExplicitPlaceEvidence } from '@/services/newsroom/geoEngine'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

function baseRewrite(over: Partial<AiRewriteResult> = {}): AiRewriteResult {
  return {
    title: '',
    spot: '',
    summary: '',
    description: '',
    seoTitle: '',
    seoDescription: '',
    categoryId: 'futbol',
    categoryConfidence: 80,
    isBreaking: false,
    city: null,
    district: null,
    country: 'Türkiye',
    tags: [],
    gateDecision: 'approve',
    gateReasons: [],
    publishScore: 80,
    ...over,
  } as AiRewriteResult
}

describe('geoEngine location safeguards', () => {
  it('Erzurumspor/GS national match does not assign Ardahan/Göle from AI or gol tag', () => {
    const evidence =
      "Galatasaray'da Osimhen ve Barış Alper'in golleri. Erzurumspor karşısında Süper Lig maç sonucu."
    const geo = enrichGeo(
      baseRewrite({
        title: "Galatasaray'da Osimhen, Barış Alper'in golleri",
        description: evidence,
        tags: ['galatasaray', 'erzurumspor', 'süper lig', 'maç sonucu', 'gol'],
        city: 'Ardahan',
        district: 'Göle',
        categoryId: 'futbol',
      }),
      [],
      { categoryId: 'futbol', evidenceText: evidence }
    )
    expect(geo.city).toBeNull()
    expect(geo.district).toBeNull()
    expect(geo.citySlug).toBe('')
    expect(geo.districtSlug).toBe('')
  })

  it('does not invent Erzurum city merely from Erzurumspor club name', () => {
    const evidence = 'Erzurumspor deplasmanda kaybetti, Galatasaray üç puanı aldı'
    const geo = enrichGeo(
      baseRewrite({
        title: 'Galatasaray kazandı',
        description: evidence,
        city: 'Erzurum',
        categoryId: 'futbol',
      }),
      [],
      { categoryId: 'futbol', evidenceText: evidence }
    )
    expect(geo.city).toBeNull()
    expect(geo.citySlug).toBe('')
  })

  it('explicit Ardahan\'da keeps Ardahan', () => {
    const evidence = "Ardahan'da kar yağışı ulaşımı aksattı"
    expect(hasExplicitPlaceEvidence(evidence, 'ardahan')).toBe(true)
    expect(extractCityFromText(evidence)).toBe('Ardahan')
    const geo = enrichGeo(
      baseRewrite({
        title: "Ardahan'da kar yağışı",
        description: evidence,
        city: 'Ardahan',
        categoryId: 'yerel-haber',
      }),
      [],
      { categoryId: 'yerel-haber', evidenceText: evidence }
    )
    expect(geo.city).toBe('Ardahan')
    expect(geo.citySlug).toBe('ardahan')
  })

  it('explicit Göle ilçesi keeps Göle/Ardahan', () => {
    const evidence = "Ardahan'ın Göle ilçesinde yol çalışması başladı"
    expect(extractDistrictSlugFromText(evidence)).toBe('gole')
    const geo = enrichGeo(
      baseRewrite({
        title: "Göle'de yol çalışması",
        description: evidence,
        categoryId: 'yerel-haber',
        city: null,
        district: null,
      }),
      [],
      { categoryId: 'yerel-haber', evidenceText: evidence }
    )
    expect(geo.citySlug).toBe('ardahan')
    expect(geo.districtSlug).toBe('gole')
  })

  it('gol / goller does not match Göle district', () => {
    expect(extractDistrictSlugFromText('maç sonucu gol goller golleri')).toBeNull()
    expect(extractDistrictSlugFromText('Göle')).toBeNull() // bare ambiguous
    expect(extractDistrictSlugFromText("Göle'de festivaller")).toBe('gole')
  })
})

describe('geoEngine MasterChef / country', () => {
  it('için must not resolve to Çin', () => {
    expect(resolveCountryFromText('Türkiye için önemli gelişme')?.name).not.toBe('Çin')
    expect(resolveCountryFromText('MasterChef Türkiye eleme için kritik gece')?.name).not.toBe('Çin')
    expect(resolveCountryFromText('Çin ile ticaret artışı')?.name).toBe('Çin')
    expect(resolveCountryFromText('Pekin’de zirve')?.name).toBe('Çin')
  })

  it('MasterChef Türkiye AI Çin/dunya → country Türkiye, no invented abroad', () => {
    const evidence =
      'MasterChef Türkiye 2026 eleme adayları Recep ve Enes için kritik gece. Dokunulmazlık oyunu.'
    const geo = enrichGeo(
      baseRewrite({
        title: 'Eleme adayları Recep ve Enes',
        description: evidence,
        tags: ['masterchef türkiye', 'dokunulmazlık oyunu', 'eleme adayı'],
        categoryId: 'dunya',
        country: 'Çin',
        city: null,
      }),
      [],
      { categoryId: 'dunya', evidenceText: evidence }
    )
    expect(geo.country).toBe('Türkiye')
    expect(geo.countrySlug).toBe('')
    expect(geo.city).toBeNull()
  })
})
