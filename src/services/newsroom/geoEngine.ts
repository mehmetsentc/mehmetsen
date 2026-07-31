/**
 * Geo Engine — enriches city/district/country and location tags + CMS slugs.
 */
import { slugifyCity } from '@/lib/location'
import {
  DISTRICT_DISPLAY_NAMES,
  DISTRICT_TO_PROVINCE_SLUG,
  extractDistrictSlugFromText,
  normalizeCitySlug,
} from '@/constants/cities'
import {
  findCountryByName,
  resolveCountryFromText,
  resolveCountrySlug,
} from '@/constants/countries'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

export interface GeoEnrichment {
  city: string | null
  district: string | null
  country: string
  citySlug: string
  districtSlug: string
  countrySlug: string
  tags: string[]
}

// All 81 Turkish provinces: [slug (ASCII), display name]
const TURKISH_PROVINCES_ALL: [string, string][] = [
  ['adana', 'Adana'], ['adiyaman', 'Adıyaman'], ['afyonkarahisar', 'Afyonkarahisar'],
  ['agri', 'Ağrı'], ['aksaray', 'Aksaray'], ['amasya', 'Amasya'], ['ankara', 'Ankara'],
  ['antalya', 'Antalya'], ['ardahan', 'Ardahan'], ['artvin', 'Artvin'],
  ['aydin', 'Aydın'], ['balikesir', 'Balıkesir'], ['bartin', 'Bartın'],
  ['batman', 'Batman'], ['bayburt', 'Bayburt'], ['bilecik', 'Bilecik'],
  ['bingol', 'Bingöl'], ['bitlis', 'Bitlis'], ['bolu', 'Bolu'],
  ['burdur', 'Burdur'], ['bursa', 'Bursa'], ['canakkale', 'Çanakkale'],
  ['cankiri', 'Çankırı'], ['corum', 'Çorum'], ['denizli', 'Denizli'],
  ['diyarbakir', 'Diyarbakır'], ['duzce', 'Düzce'], ['edirne', 'Edirne'],
  ['elazig', 'Elazığ'], ['erzincan', 'Erzincan'], ['erzurum', 'Erzurum'],
  ['eskisehir', 'Eskişehir'], ['gaziantep', 'Gaziantep'], ['giresun', 'Giresun'],
  ['gumushane', 'Gümüşhane'], ['hakkari', 'Hakkari'], ['hatay', 'Hatay'],
  ['igdir', 'Iğdır'], ['isparta', 'Isparta'], ['istanbul', 'İstanbul'],
  ['izmir', 'İzmir'], ['kahramanmaras', 'Kahramanmaraş'], ['karabuk', 'Karabük'],
  ['karaman', 'Karaman'], ['kars', 'Kars'], ['kastamonu', 'Kastamonu'],
  ['kayseri', 'Kayseri'], ['kilis', 'Kilis'], ['kirikkale', 'Kırıkkale'],
  ['kirklareli', 'Kırklareli'], ['kirsehir', 'Kırşehir'], ['kocaeli', 'Kocaeli'],
  ['konya', 'Konya'], ['kutahya', 'Kütahya'], ['malatya', 'Malatya'],
  ['manisa', 'Manisa'], ['mardin', 'Mardin'], ['mersin', 'Mersin'],
  ['mugla', 'Muğla'], ['mus', 'Muş'], ['nevsehir', 'Nevşehir'],
  ['nigde', 'Niğde'], ['ordu', 'Ordu'], ['osmaniye', 'Osmaniye'],
  ['rize', 'Rize'], ['sakarya', 'Sakarya'], ['samsun', 'Samsun'],
  ['sanliurfa', 'Şanlıurfa'], ['siirt', 'Siirt'], ['sinop', 'Sinop'],
  ['sirnak', 'Şırnak'], ['sivas', 'Sivas'], ['tekirdag', 'Tekirdağ'],
  ['tokat', 'Tokat'], ['trabzon', 'Trabzon'], ['tunceli', 'Tunceli'],
  ['usak', 'Uşak'], ['van', 'Van'], ['yalova', 'Yalova'],
  ['yozgat', 'Yozgat'], ['zonguldak', 'Zonguldak'],
]

const CITY_DISPLAY: Map<string, string> = new Map(TURKISH_PROVINCES_ALL)

const AMBIGUOUS_CITY_SLUGS = new Set(['agri', 'van', 'ordu', 'mus', 'bolu', 'batman'])

const NATIONAL_SCOPE_KEYWORDS = [
  'cumhurbaskani', 'erdogan', 'tbmm', 'basbakan',
  'savunma bakani', 'disisleri bakani', 'icisleri bakani',
  'genel kurul', 'anayasa mahkemesi', 'yargitay', 'danistay',
  'kilicdaroglu', 'bahceli',
  'secim kampanyasi', 'parti genel baskani', 'parti kurultayi',
  'nato zirvesi', 'ab zirvesi', 'birlesmis milletler',
]

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

export function extractCityFromText(text: string): string | null {
  const lower = normalizeTr(text)

  const isNationalScope = NATIONAL_SCOPE_KEYWORDS.some((kw) => lower.includes(kw))
  if (isNationalScope) return null

  for (const [slug] of TURKISH_PROVINCES_ALL) {
    if (AMBIGUOUS_CITY_SLUGS.has(slug)) continue
    const re = new RegExp(`(?<![a-z])${slug}(?![a-z])`)
    if (re.test(lower)) {
      return CITY_DISPLAY.get(slug) ?? slug
    }
  }
  return null
}

function normalizeDisplayCity(raw: string): string {
  const slug = normalizeTr(raw).replace(/\s+/g, '')
  return CITY_DISPLAY.get(slug) ?? raw
}

function resolveDistrictDisplay(districtRaw: string | null, citySlug: string): {
  district: string | null
  districtSlug: string
} {
  if (!districtRaw?.trim() && !citySlug) return { district: null, districtSlug: '' }

  const haystack = normalizeTr(districtRaw || '')
  let slug =
    (districtRaw ? extractDistrictSlugFromText(haystack) : null) ||
    (districtRaw
      ? normalizeTr(districtRaw).replace(/\s+/g, '-').replace(/-+/g, '-')
      : '')

  // İlçe → il eşlemesi: şehir biliniyorsa yalnızca o ile ait ilçeyi kabul et
  if (slug && citySlug) {
    const province = DISTRICT_TO_PROVINCE_SLUG[slug]
    if (province && province !== citySlug) {
      // Yanlış ilçe / başka il — reddet, metinden şehir ilçesini ara
      slug = ''
    }
  }

  if (!slug && citySlug && districtRaw) {
    // Serbest metin: display name ile eşle
    for (const [dSlug, name] of Object.entries(DISTRICT_DISPLAY_NAMES)) {
      if (DISTRICT_TO_PROVINCE_SLUG[dSlug] !== citySlug) continue
      if (normalizeTr(name) === haystack || dSlug === haystack.replace(/\s+/g, '-')) {
        slug = dSlug
        break
      }
    }
  }

  if (!slug) return { district: districtRaw?.trim() || null, districtSlug: '' }

  const name = DISTRICT_DISPLAY_NAMES[slug] || districtRaw?.trim() || slug
  return { district: name, districtSlug: slug }
}

export function enrichGeo(
  rewritten: AiRewriteResult,
  extraTags: string[] = [],
  opts?: { categoryId?: string | null }
): GeoEnrichment {
  let city = rewritten.city?.trim() || null
  let district = rewritten.district?.trim() || null
  let country = rewritten.country?.trim() || 'Türkiye'
  const haystack = `${rewritten.title} ${rewritten.description} ${(rewritten.tags || []).join(' ')}`
  const categoryId = opts?.categoryId || rewritten.categoryId || ''

  // Dünya / yurt dışı: ülküyü AI + metinden kesinleştir
  const fromAiCountry =
    country && country !== 'Türkiye' ? findCountryByName(country) : null
  const fromTextCountry =
    categoryId === 'dunya' || (country && country !== 'Türkiye') || !country
      ? resolveCountryFromText(haystack)
      : null

  if (categoryId === 'dunya' || fromAiCountry || fromTextCountry) {
    const resolved = fromAiCountry || fromTextCountry
    if (resolved) {
      country = resolved.name
    } else if (categoryId === 'dunya' && (!country || country === 'Türkiye')) {
      // Dünya kategorisi ama ülke çıkarılamadı — Türkiye bırakma
      const retry = resolveCountryFromText(haystack)
      if (retry) country = retry.name
    }
  }

  const isAbroad = Boolean(country && country !== 'Türkiye')

  if (isAbroad) {
    city = null
    district = null
  } else if (city) {
    city = normalizeDisplayCity(city)
    const slugCheck = normalizeTr(city).replace(/\s+/g, '')
    if (!CITY_DISPLAY.has(slugCheck)) {
      city = extractCityFromText(haystack)
      district = null
    }
  } else {
    city = extractCityFromText(haystack)
  }

  const citySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''

  // İlçe: AI + metin (yalnızca Türkiye + şehir biliniyorken)
  let districtSlug = ''
  if (!isAbroad) {
    const fromTextDistrict = extractDistrictSlugFromText(haystack)
    // Metin ilçesi şehri doğrular / doldurur
    if (fromTextDistrict) {
      const province = DISTRICT_TO_PROVINCE_SLUG[fromTextDistrict]
      if (province) {
        if (!citySlug) {
          city = CITY_DISPLAY.get(province) ?? province
        } else if (citySlug !== province) {
          // Metin ilçesi başka ile ait — şehir AI/metin öncelikli; ilçeyi atla
        } else {
          district = DISTRICT_DISPLAY_NAMES[fromTextDistrict] || district
        }
        if (!citySlug || citySlug === province) {
          district = DISTRICT_DISPLAY_NAMES[fromTextDistrict] || district
          districtSlug = fromTextDistrict
        }
      }
    }

    if (!districtSlug) {
      const resolved = resolveDistrictDisplay(district, city ? normalizeCitySlug(slugifyCity(city)) : citySlug)
      district = resolved.district
      districtSlug = resolved.districtSlug
    }
  }

  const finalCitySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''
  const countrySlug =
    country && country !== 'Türkiye'
      ? resolveCountrySlug(undefined, country) || resolveCountryFromText(country)?.slug || ''
      : ''

  const tags = [...rewritten.tags]
  if (finalCitySlug && !tags.includes(finalCitySlug)) tags.unshift(finalCitySlug)
  if (districtSlug && !tags.includes(districtSlug)) tags.push(districtSlug)
  if (countrySlug && !tags.includes(countrySlug)) tags.push(countrySlug)
  for (const tag of extraTags) {
    if (!tags.includes(tag)) tags.push(tag)
  }

  return {
    city,
    district,
    country,
    citySlug: finalCitySlug,
    districtSlug,
    countrySlug,
    tags,
  }
}

export const geoEngine = {
  enrich: enrichGeo,
}
