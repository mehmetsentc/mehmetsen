import { describe, expect, it } from 'vitest'
import {
  extractDistrictSlugFromText,
  extractProvinceDistrictPairFromText,
} from '@/constants/cities'
import { hintCategoryFromText } from '@/lib/ai/editorial/categoryHint'
import {
  demoteNeverLocalVertical,
  shouldStripSuggestedCityForCategory,
} from '@/lib/news/neverLocalVerticals'
import { validateCategoryClassification } from '@/services/newsroom/categoryEngine'
import {
  enrichGeo,
  extractCityFromText,
  hasExplicitPlaceEvidence,
} from '@/services/newsroom/geoEngine'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

function baseRewrite(over: Partial<AiRewriteResult> = {}): AiRewriteResult {
  return {
    title: '',
    spot: '',
    summary: '',
    description: '',
    seoTitle: '',
    seoDescription: '',
    categoryId: 'gundem',
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

describe('never-local verticals', () => {
  it('demotes yerel-otomobil → otomobil', () => {
    expect(demoteNeverLocalVertical('yerel-otomobil')).toEqual({
      categoryId: 'otomobil',
      demoted: true,
      reason: 'yerel-otomobil → otomobil (never-local vertical)',
    })
  })

  it('strips suggested city for teknoloji/otomobil', () => {
    expect(shouldStripSuggestedCityForCategory('teknoloji')).toBe(true)
    expect(shouldStripSuggestedCityForCategory('otomobil')).toBe(true)
    expect(shouldStripSuggestedCityForCategory('yerel-haber')).toBe(false)
  })

  it('Honda industry → otomobil not yerel', () => {
    const v = validateCategoryClassification({
      aiCategoryId: 'yerel-otomobil',
      title: 'Honda Prelude, NSX ve diğer efsane modeller üretimden kalktı',
      body: 'Büyük otomotiv üreticilerinin stratejik hataları. Honda birkaç eşsiz modeli üretimden kaldırdı.',
    })
    expect(v.categoryId).toBe('otomobil')
  })
})

describe('ortada ≠ Çankırı/Orta (tech CMS path)', () => {
  it('does not extract Orta from ortada / orta seviye', () => {
    expect(extractDistrictSlugFromText('mesajlar ortada işleniyor gizlilik')).toBeNull()
    expect(extractDistrictSlugFromText('orta seviye şifreleme')).toBeNull()
    expect(extractDistrictSlugFromText("Çankırı'nın Orta ilçesinde yol çalışması")).toBe('orta')
  })

  it('OpenAI/Apple tech hint has no Çankırı city', () => {
    const hint = hintCategoryFromText(
      "OpenAI, ChatGPT'yi Apple Messages'a getiriyor. Bloomberg'e göre mesajlar cihaz üzerinde ortada işleniyor; gizlilik tartışması sürüyor.",
    )
    expect(hint?.categoryId).toBe('teknoloji')
    expect(hint?.citySlug).toBeUndefined()
    expect(hint?.districtSlug).toBeUndefined()
  })

  it('enrichGeo clears AI Çankırı/Orta on tech story', () => {
    const evidence =
      "OpenAI ve Apple, ChatGPT entegrasyonunu duyurdu. Mesajlar cihaz üzerinde işleniyor; ortada sunucu iddiası tartışılıyor."
    const geo = enrichGeo(
      baseRewrite({
        title: 'ChatGPT Apple Messages',
        description: evidence,
        categoryId: 'teknoloji',
        city: 'Çankırı',
        district: 'Orta',
      }),
      [],
      { categoryId: 'teknoloji', evidenceText: evidence },
    )
    expect(geo.city).toBeNull()
    expect(geo.district).toBeNull()
    expect(geo.citySlug).toBe('')
    expect(geo.districtSlug).toBe('')
  })
})

describe('Bingöl Genç pair (not Ankara)', () => {
  it('extracts province+district from Bingöl\'ün Genç ilçesinde', () => {
    const t =
      "Bingöl'ün Genç ilçesinde debisi yükselen Murat Nehri'ne giren iki kardeş akıntıya kapıldı."
    expect(extractProvinceDistrictPairFromText(t)).toEqual({
      provinceSlug: 'bingol',
      districtSlug: 'genc',
    })
    expect(extractDistrictSlugFromText(t)).toBe('genc')
    expect(extractCityFromText(t)).toBe('Bingöl')
  })

  it('enrichGeo overrides AI Ankara with Bingöl/Genç', () => {
    const evidence =
      "Bingöl'ün Genç ilçesinde debisi yükselen Murat Nehri'ne giren iki kardeş akıntıya kapıldı. 15 yaşındaki kardeş kurtarılırken, 30 yaşındaki Mehmet Hazar'ın cansız bedenine ulaşıldı."
    const geo = enrichGeo(
      baseRewrite({
        title: "Bingöl'de iki kardeş boğuldu",
        description: evidence,
        categoryId: 'yerel-haber',
        city: 'Ankara',
        district: null,
      }),
      [],
      { categoryId: 'yerel-haber', evidenceText: evidence },
    )
    expect(geo.citySlug).toBe('bingol')
    expect(geo.city).toBe('Bingöl')
    expect(geo.districtSlug).toBe('genc')
    expect(geo.district).toBe('Genç')
  })

  it('keskin adjective does not become Kırıkkale/Keskin', () => {
    expect(
      extractDistrictSlugFromText('Honda modellerinde keskin rekabet ve üretimden kaldırma'),
    ).toBeNull()
  })
})

describe('regression: Fatih / Inter / Suriye / MasterChef', () => {
  it('Fatih Yaşlı is not Fatih district', () => {
    expect(hasExplicitPlaceEvidence('Fatih Yaşlı konuştu', 'fatih')).toBe(false)
    expect(extractDistrictSlugFromText('Fatih Yaşlı Suriye yorumu')).toBeNull()
  })

  it('ortada still blocked after Inter-style orta saha', () => {
    expect(extractDistrictSlugFromText('orta saha oyuncusu transfer')).toBeNull()
  })
})

describe('Çanakkale belediye → yerel OK', () => {
  it('keeps local primary for belediye meclisi', () => {
    const hint = hintCategoryFromText(
      "Çanakkale Belediye Meclisi su kesintisi kararını oybirliğiyle kabul etti. Valilik duyurusu yayımlandı.",
    )
    expect(hint?.categoryId).toBe('yerel-haber')
    expect(hint?.citySlug).toBe('canakkale')
  })
})
