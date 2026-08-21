/**
 * Geo Engine — enriches city/district/country and location tags + CMS slugs.
 * Prefers empty location over wrong guesses (LLM hallucination / weak tokens).
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
import { ALL_TURKISH_PRO_FOOTBALL_CLUBS } from '@/constants/turkishFootballClubs'
import { detectNationalFootballClub } from '@/lib/news/nationalFootballRouting'
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

export interface GeoEnrichOpts {
  categoryId?: string | null
  /** Original source title/summary/body — preferred over rewritten text for place evidence. */
  evidenceText?: string | null
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

const SPORTS_CATEGORY_IDS = new Set([
  'spor', 'futbol', 'basketbol', 'voleybol', 'hentbol', 'atletizm', 'gures', 'dunya-kupasi-2026',
  'yerel-spor', 'yerel-futbol', 'yerel-basketbol', 'yerel-voleybol',
])

const CLUB_PROVINCE_BY_TOKEN: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const club of ALL_TURKISH_PRO_FOOTBALL_CLUBS) {
    const province = club.provinceSlug
    if (!province) continue
    const tokens = [club.name, ...(club.aliases ?? [])]
    for (const raw of tokens) {
      const t = normalizeTr(raw).replace(/\s+/g, ' ').trim()
      if (t.length >= 3) map.set(t, province)
    }
  }
  return map
})()

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

/**
 * Explicit place evidence: "Ardahan'da", "Ardahan ili", bare province not inside *spor.
 */
export function hasExplicitPlaceEvidence(text: string, placeSlug: string): boolean {
  if (!placeSlug) return false
  const lower = normalizeTr(text)
  const slug = normalizeTr(placeSlug).replace(/\s+/g, '')
  if (!slug) return false
  // Reject club-compound: erzurumspor must not count as Erzurum place
  const clubCompound = new RegExp(`(?<![a-z0-9])${slug}(?:spor|fk|sk)(?![a-z0-9])`)
  if (clubCompound.test(lower)) {
    // Still allow real place if locative also present elsewhere
  }
  const locative = new RegExp(
    `(?<![a-z0-9])${slug}(?:['']?(?:da|de|ta|te|dan|den|tan|ten|nin|nun|in|un|a|e)|\\s+ili|\\s+ilcesi|\\s+ilce)(?![a-z0-9])`
  )
  if (locative.test(lower)) return true
  // Bare province/district word, not prefix of *spor/fk
  const bare = new RegExp(`(?<![a-z0-9])${slug}(?!(?:spor|fk|sk)[a-z0-9]*)(?![a-z0-9])`)
  return bare.test(lower)
}

export function extractCityFromText(text: string): string | null {
  const lower = normalizeTr(text)

  const isNationalScope = NATIONAL_SCOPE_KEYWORDS.some((kw) => lower.includes(kw))
  if (isNationalScope) return null

  for (const [slug] of TURKISH_PROVINCES_ALL) {
    if (AMBIGUOUS_CITY_SLUGS.has(slug)) continue
    if (!hasExplicitPlaceEvidence(text, slug)) continue
    return CITY_DISPLAY.get(slug) ?? slug
  }
  return null
}

function normalizeDisplayCity(raw: string): string {
  const slug = normalizeTr(raw).replace(/\s+/g, '')
  return CITY_DISPLAY.get(slug) ?? raw
}

function isKnownProvince(city: string): boolean {
  const slug = normalizeTr(city).replace(/\s+/g, '')
  return CITY_DISPLAY.has(slug)
}

function clubProvincesInText(text: string): Set<string> {
  const lower = normalizeTr(text)
  const found = new Set<string>()
  for (const [token, province] of CLUB_PROVINCE_BY_TOKEN) {
    const re = new RegExp(`(?<![a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`)
    if (re.test(lower)) found.add(province)
  }
  return found
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
      slug = ''
    }
  }

  if (!slug && citySlug && districtRaw) {
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

function looksLikeDomesticTurkeyContent(text: string): boolean {
  const lower = normalizeTr(text)
  return (
    /\bmasterchef\b/.test(lower) ||
    /\bturkiye\b/.test(lower) ||
    /\bsuper lig\b/.test(lower) ||
    /\bsuperlig\b/.test(lower) ||
    detectNationalFootballClub(text) != null
  )
}

export function enrichGeo(
  rewritten: AiRewriteResult,
  extraTags: string[] = [],
  opts?: GeoEnrichOpts
): GeoEnrichment {
  let city = rewritten.city?.trim() || null
  let district = rewritten.district?.trim() || null
  let country = rewritten.country?.trim() || 'Türkiye'
  // Tags are noisy (gol, club names) — never extract geography from tags alone
  const rewrittenHay =
    `${rewritten.title} ${rewritten.description || ''} ${rewritten.summary || ''}`.trim()
  const evidenceHay = (opts?.evidenceText || rewrittenHay).trim() || rewrittenHay
  const categoryId = opts?.categoryId || rewritten.categoryId || ''

  // Ülke: yalnızca kaynak metinde kanıt varsa yabancı ülke kabul et (için≠Çin).
  const fromTextCountry = resolveCountryFromText(evidenceHay)
  const fromAiCountry =
    country && country !== 'Türkiye' ? findCountryByName(country) : null

  if (fromAiCountry) {
    if (fromTextCountry && fromTextCountry.slug === fromAiCountry.slug) {
      country = fromAiCountry.name
    } else {
      // AI uydurması veya zayıf eşleşme — TR bırak (MasterChef / spor)
      country = 'Türkiye'
    }
  } else if (categoryId === 'dunya') {
    country = fromTextCountry?.name || 'Türkiye'
  } else if (country !== 'Türkiye' && !fromTextCountry) {
    country = 'Türkiye'
  }

  if (
    country !== 'Türkiye' &&
    looksLikeDomesticTurkeyContent(evidenceHay) &&
    !fromTextCountry
  ) {
    country = 'Türkiye'
  }

  let isAbroad = Boolean(country && country !== 'Türkiye')

  if (isAbroad) {
    city = null
    district = null
  } else {
    // AI city only if known province AND evidenced in source (not tags)
    if (city) {
      city = normalizeDisplayCity(city)
      if (!isKnownProvince(city)) {
        city = null
        district = null
      } else {
        const slug = normalizeCitySlug(slugifyCity(city))
        if (!hasExplicitPlaceEvidence(evidenceHay, slug)) {
          city = null
          district = null
        }
      }
    }

    if (!city) {
      city = extractCityFromText(evidenceHay)
    }

    // Club allowlist contradiction: Erzurumspor ≠ Ardahan
    if (city) {
      const citySlugCheck = normalizeCitySlug(slugifyCity(city))
      const clubs = clubProvincesInText(evidenceHay)
      if (clubs.size > 0 && !clubs.has(citySlugCheck) && !hasExplicitPlaceEvidence(evidenceHay, citySlugCheck)) {
        city = null
        district = null
      }
    }

    // National Süper Lig / pro football: no random local city unless explicit place
    const nationalClub = detectNationalFootballClub(evidenceHay)
    if (
      nationalClub &&
      (SPORTS_CATEGORY_IDS.has(categoryId) || categoryId === 'futbol' || !categoryId) &&
      city
    ) {
      const slug = normalizeCitySlug(slugifyCity(city))
      if (!hasExplicitPlaceEvidence(evidenceHay, slug)) {
        city = null
        district = null
      }
    }
  }

  const citySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''

  let districtSlug = ''
  if (!isAbroad) {
    const fromTextDistrict = extractDistrictSlugFromText(evidenceHay)
    if (fromTextDistrict) {
      const province = DISTRICT_TO_PROVINCE_SLUG[fromTextDistrict]
      if (province) {
        if (!citySlug) {
          city = CITY_DISPLAY.get(province) ?? province
        }
        const nextCitySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''
        if (!citySlug || nextCitySlug === province || !citySlug) {
          if (!citySlug || citySlug === province) {
            district = DISTRICT_DISPLAY_NAMES[fromTextDistrict] || district
            districtSlug = fromTextDistrict
            if (!city) city = CITY_DISPLAY.get(province) ?? province
          }
        }
      }
    }

    // AI district: only if evidenced
    if (!districtSlug && district) {
      const dNorm = normalizeTr(district)
      if (hasExplicitPlaceEvidence(evidenceHay, dNorm.replace(/\s+/g, '-')) ||
          hasExplicitPlaceEvidence(evidenceHay, dNorm.replace(/\s+/g, ''))) {
        const resolved = resolveDistrictDisplay(
          district,
          city ? normalizeCitySlug(slugifyCity(city)) : citySlug
        )
        district = resolved.district
        districtSlug = resolved.districtSlug
      } else {
        district = null
      }
    } else if (!districtSlug) {
      district = null
    }
  }

  // Recompute abroad after country cleanup
  isAbroad = Boolean(country && country !== 'Türkiye')
  if (isAbroad) {
    city = null
    district = null
    districtSlug = ''
  }

  const finalCitySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''
  const countrySlug =
    country && country !== 'Türkiye'
      ? resolveCountrySlug(undefined, country) || resolveCountryFromText(country)?.slug || ''
      : ''

  const tags = [...(rewritten.tags || [])]
  if (finalCitySlug && !tags.includes(finalCitySlug)) tags.unshift(finalCitySlug)
  if (districtSlug && !tags.includes(districtSlug)) tags.push(districtSlug)
  if (countrySlug && !tags.includes(countrySlug)) tags.push(countrySlug)
  for (const tag of extraTags) {
    if (!tags.includes(tag)) tags.push(tag)
  }

  return {
    city,
    district: districtSlug ? district : null,
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
