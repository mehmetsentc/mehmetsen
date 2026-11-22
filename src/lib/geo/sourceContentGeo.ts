/**
 * GÖREV 43 A2 — Haberin il/ilçesini KAYNAK METİNDEN bulur.
 *
 * Sorun: «AI ile yaz» akışında kaynak gazetenin ili (`forcedCitySlug`) editör
 * yönlendirmesine ve yazar talimatına «il: X» olarak veriliyordu. Model metni o
 * ile göre yazıyor, geo motoru da yeniden yazılmış metinde ilin adını «kanıt»
 * sayıyordu → başka ilin haberi kaynak gazetenin iline düşüyordu.
 *
 * Bu modül yalnızca ÖZGÜN kaynak metne bakar (başlık > özet > gövde):
 *   1. «X'in Y ilçesinde» kalıbı (en güçlü sinyal)
 *   2. locateSondakikaArticle (81 il, 973 ilçe, çakışan ilçe kuralları)
 *   3. geoEngine.extractCityFromText ile çapraz kontrol
 * İki dedektör farklı il söylüyorsa güven düşük kalır ve hiçbir şey ezilmez.
 */
import {
  DISTRICT_DISPLAY_NAMES,
  extractProvinceDistrictPairFromText,
  getCityCategoryName,
  normalizeCitySlug,
} from '@/constants/cities'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'
import { slugifyCity } from '@/lib/location'
import { locateSondakikaArticle } from '@/services/crawler/sondakika/locate'
import { extractCityFromText } from '@/services/newsroom/geoEngine'

export type SourceGeoConfidence = 'high' | 'medium' | 'low'

export interface SourceContentGeo {
  citySlug: string | null
  cityName: string | null
  districtSlug: string | null
  districtName: string | null
  confidence: SourceGeoConfidence
  /** 4+ il güçlü geçiyor (meteoroloji uyarısı vb.) → il haberi değil. */
  likelyNational: boolean
  method: 'pair' | 'locate' | 'locate+text' | 'text' | 'none' | 'conflict'
}

const NONE: SourceContentGeo = {
  citySlug: null,
  cityName: null,
  districtSlug: null,
  districtName: null,
  confidence: 'low',
  likelyNational: false,
  method: 'none',
}

function districtSlugFor(provinceSlug: string, districtName: string | null): string | null {
  if (!districtName) return null
  const list = PROVINCE_DISTRICTS[provinceSlug] ?? []
  const hit = list.find((d) => d.name.toLocaleLowerCase('tr-TR') === districtName.toLocaleLowerCase('tr-TR'))
  return hit?.slug ?? null
}

export function resolveSourceContentGeo(input: {
  title?: string | null
  summary?: string | null
  body?: string | null
}): SourceContentGeo {
  const title = (input.title ?? '').trim()
  const summary = (input.summary ?? '').trim()
  const body = (input.body ?? '').trim().slice(0, 6000)
  const all = [title, summary, body].filter(Boolean).join('\n')
  if (all.length < 12) return NONE

  const loc = locateSondakikaArticle({ title, description: summary, body })
  if (loc.likelyNational) return { ...NONE, likelyNational: true, method: 'none' }

  const pair = extractProvinceDistrictPairFromText(all)
  if (pair) {
    return {
      citySlug: pair.provinceSlug,
      cityName: getCityCategoryName(pair.provinceSlug),
      districtSlug: pair.districtSlug,
      districtName: DISTRICT_DISPLAY_NAMES[pair.districtSlug] ?? null,
      confidence: 'high',
      likelyNational: false,
      method: 'pair',
    }
  }

  const textCityName = extractCityFromText(all)
  const textSlug = textCityName ? normalizeCitySlug(slugifyCity(textCityName)) : null
  const locSlug = loc.provinceSlug

  if (locSlug && textSlug && locSlug !== textSlug) {
    return { ...NONE, method: 'conflict' }
  }
  if (locSlug) {
    const districtSlug = districtSlugFor(locSlug, loc.districtName)
    return {
      citySlug: locSlug,
      cityName: loc.provinceName ?? getCityCategoryName(locSlug),
      districtSlug,
      districtName: districtSlug ? loc.districtName : null,
      confidence: loc.confidence === 'high' ? 'high' : loc.confidence === 'medium' ? 'medium' : 'low',
      likelyNational: false,
      method: textSlug ? 'locate+text' : 'locate',
    }
  }
  if (textSlug) {
    return {
      citySlug: textSlug,
      cityName: getCityCategoryName(textSlug),
      districtSlug: null,
      districtName: null,
      confidence: 'medium',
      likelyNational: false,
      method: 'text',
    }
  }
  return NONE
}

/**
 * Kaynak ili ile içerik ili karşılaştırması → pipeline girdisine uygulanacak
 * düzeltme. null = dokunma.
 * - İçerik yüksek güvenle başka il diyor → içerik ili (ilçe dahil).
 * - İçerik ulusal diyor ve kaynak ili var → kaynak ili düşer.
 * - Kaynak ili yok → dokunma (ulusal akış aynı kalır).
 */
export function sourceGeoOverride(
  publisherSlug: string,
  geo: SourceContentGeo
): {
  forcedCitySlug: string | undefined
  forcedCity: string | undefined
  forcedDistrict: string | undefined
} | null {
  if (geo.likelyNational) {
    return publisherSlug
      ? { forcedCitySlug: undefined, forcedCity: undefined, forcedDistrict: undefined }
      : null
  }
  if (geo.confidence !== 'high' || !geo.citySlug) return null
  // Kaynağın ili yoksa (ulusal kaynak) dokunulmaz: «Ankara'da açıklama yapan
  // Bakan» haberini yerel masaya çekmemek için mevcut ulusal akış korunur.
  if (!publisherSlug) return null
  if (geo.citySlug === publisherSlug) {
    return geo.districtName
      ? { forcedCitySlug: geo.citySlug, forcedCity: geo.cityName ?? undefined, forcedDistrict: geo.districtName }
      : null
  }
  return {
    forcedCitySlug: geo.citySlug,
    forcedCity: geo.cityName ?? undefined,
    forcedDistrict: geo.districtName ?? undefined,
  }
}
