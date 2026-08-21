/**
 * Geo Engine — enriches city/district/country and location tags + CMS slugs.
 * Prefers empty location over wrong guesses (LLM hallucination / weak tokens).
 */
import { slugifyCity } from '@/lib/location'
import {
  DISTRICT_DISPLAY_NAMES,
  DISTRICT_TO_PROVINCE_SLUG,
  extractDistrictSlugFromText,
  extractProvinceDistrictPairFromText,
  normalizeCitySlug,
} from '@/constants/cities'
import {
  findCountryByName,
  findCountryBySlug,
  resolveCountryFromText,
  resolveCountrySlug,
} from '@/constants/countries'
import { ALL_TURKISH_PRO_FOOTBALL_CLUBS } from '@/constants/turkishFootballClubs'
import { detectNationalFootballClub } from '@/lib/news/nationalFootballRouting'
import {
  isNeverLocalVertical,
  shouldClearCityForNeverLocalVertical,
} from '@/lib/news/neverLocalVerticals'
import { isYerelCategoryTree } from '@/constants/config'
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
 * Given-name districts (Fatih) need locative — "Fatih Yaşlı" is a person, not a place.
 * Apostrophes: ASCII + curly (‘ ’ ´) so "Bingöl'ün" matches.
 */
const APOSTROPHE_CLASS = `[''\u2019\u2018\u00B4]`

/** AA / agency dateline — weak capital evidence, must lose to real event place. */
function stripAgencyDatelines(text: string): string {
  return text.replace(
    /\b(?:ankara|istanbul|izmir|london|new york|washington)\s*(?:\(\s*aa\s*\)|\(\s*reuters\s*\)|\(\s*ap\s*\)|\(\s*afp\s*\))?[\s:—-]+/gi,
    ' ',
  )
}

export function hasExplicitPlaceEvidence(text: string, placeSlug: string): boolean {
  if (!placeSlug) return false
  const lower = normalizeTr(text)
  const slug = normalizeTr(placeSlug).replace(/\s+/g, '')
  if (!slug) return false

  const locative = new RegExp(
    `(?<![a-z0-9])${slug}(?:${APOSTROPHE_CLASS}?(?:da|de|ta|te|dan|den|tan|ten|nin|nun|in|un|a|e)|\\s+ili|\\s+ilcesi|\\s+ilce)(?![a-z0-9])`
  )
  if (locative.test(lower)) return true

  // Given-name / ambiguous short tokens: never accept bare match
  if (
    slug === 'fatih' ||
    slug === 'orta' ||
    slug === 'gole' ||
    slug === 'genc' ||
    slug === 'keskin' ||
    slug === 'osman' ||
    slug === 'mustafa' ||
    slug === 'kemal' ||
    slug === 'mehmet' ||
    slug === 'ahmet' ||
    slug === 'ali' ||
    slug === 'hasan' ||
    slug === 'huseyin' ||
    slug === 'yunus' ||
    slug === 'emre' ||
    slug === 'ece' ||
    slug === 'ada'
  ) {
    return false
  }

  // Bare province/district word, not prefix of *spor/fk
  const bare = new RegExp(`(?<![a-z0-9])${slug}(?!(?:spor|fk|sk)[a-z0-9]*)(?![a-z0-9])`)
  return bare.test(lower)
}

/**
 * Prefer strongest place evidence (not first province in alphabet).
 * Locative / "X ili" beats bare token; agency dateline capitals are demoted.
 */
export function extractCityFromText(text: string): string | null {
  const pair = extractProvinceDistrictPairFromText(text)
  if (pair) return CITY_DISPLAY.get(pair.provinceSlug) ?? pair.provinceSlug

  const cleaned = stripAgencyDatelines(text)
  const lower = normalizeTr(cleaned)

  const isNationalScope = NATIONAL_SCOPE_KEYWORDS.some((kw) => lower.includes(kw))
  if (isNationalScope) return null

  type Hit = { slug: string; score: number }
  const hits: Hit[] = []
  for (const [slug] of TURKISH_PROVINCES_ALL) {
    if (AMBIGUOUS_CITY_SLUGS.has(slug)) continue
    if (!hasExplicitPlaceEvidence(cleaned, slug)) continue
    const locative = new RegExp(
      `(?<![a-z0-9])${slug}(?:${APOSTROPHE_CLASS}?(?:da|de|ta|te|dan|den|tan|ten|nin|nun|in|un)|\\s+ili|\\s+ilce)`,
    )
    const score = locative.test(normalizeTr(cleaned)) ? 3 : 1
    // Demote capitals when only bare/dateline-weak
    const capitalPenalty =
      (slug === 'ankara' || slug === 'istanbul') && score === 1 ? -2 : 0
    hits.push({ slug, score: score + capitalPenalty })
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => b.score - a.score)
  if (hits[0].score <= 0) return null
  return CITY_DISPLAY.get(hits[0].slug) ?? hits[0].slug
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
    /\bsuper lig\b/.test(lower) ||
    /\bsuperlig\b/.test(lower) ||
    detectNationalFootballClub(text) != null
  )
}

/**
 * Yabancı lig / kulüp → ülke. TR kulübü varken yalnızca lig sinyalinden ülke çıkar.
 */
export function detectForeignFootballCountry(
  text: string
): ReturnType<typeof findCountryBySlug> | null {
  const lower = normalizeTr(text)
  const hasTrClub = detectNationalFootballClub(text) != null

  if (/\bserie\s*a\b/.test(lower) || /\bcizme\b/.test(lower)) {
    return findCountryBySlug('italya') ?? null
  }
  if (/\bpremier\s*league\b/.test(lower)) {
    return findCountryBySlug('birlesik-krallik') ?? findCountryByName('Birleşik Krallık') ?? null
  }
  if (/\bla\s*liga\b/.test(lower)) return findCountryBySlug('ispanya') ?? null
  if (/\bbundesliga\b/.test(lower)) return findCountryBySlug('almanya') ?? null
  if (/\bligue\s*1\b/.test(lower)) return findCountryBySlug('fransa') ?? null

  if (hasTrClub) return null

  if (
    /\b(?:inter(?:\s+milan)?|juventus|napoli|atalanta|fiorentina|ac\s*milan|as\s*roma|lazio)\b/.test(
      lower
    )
  ) {
    return findCountryBySlug('italya') ?? null
  }
  if (
    /\b(?:liverpool|manchester\s+united|manchester\s+city|arsenal|chelsea|tottenham)\b/.test(lower)
  ) {
    return findCountryBySlug('birlesik-krallik') ?? findCountryByName('Birleşik Krallık') ?? null
  }
  return null
}

/**
 * Olay ülkesi: İsrail saldırısı + Suriye/İdlib → Suriye (olay yeri).
 * Generic resolveCountryFromText often returns the actor (İsrail) first.
 */
export function resolveEventCountryFromText(text: string) {
  const lower = normalizeTr(text)
  if (/\bsuriye\b|\bsyria\b|\bidlib\b|\bidlip\b|\bhalep\b|\baleppo\b/.test(lower)) {
    return findCountryBySlug('suriye') ?? resolveCountryFromText(text)
  }
  const foreignFootball = detectForeignFootballCountry(text)
  if (foreignFootball) return foreignFootball
  return resolveCountryFromText(text)
}

/** AI-proposed district only if extractDistrictSlugFromText agrees (strong for ambiguous). */
function aiDistrictIsEvidenced(evidence: string, districtRaw: string): boolean {
  const fromText = extractDistrictSlugFromText(evidence)
  if (!fromText) return false
  const want = normalizeTr(districtRaw).replace(/\s+/g, '-')
  const wantCompact = want.replace(/-/g, '')
  return (
    fromText === want ||
    fromText === wantCompact ||
    normalizeTr(DISTRICT_DISPLAY_NAMES[fromText] || '') === normalizeTr(districtRaw)
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
  // Prefer union of original evidence + rewrite so Bingöl in body is not lost
  // when AI/source left a wrong capital, and rewrite still has the place.
  const evidenceHay = [opts?.evidenceText, rewrittenHay]
    .filter((s) => Boolean(s && String(s).trim()))
    .join('\n')
    .trim() || rewrittenHay
  const categoryId = opts?.categoryId || rewritten.categoryId || ''

  // Strongest signal: "Bingöl'ün Genç ilçesinde"
  const provinceDistrictPair = extractProvinceDistrictPairFromText(evidenceHay)

  // Ülke: olay yeri (Suriye/İdlib) + yabancı futbol ligi; için≠Çin zaten resolveCountryFromText'te.
  const isSportsCategory =
    SPORTS_CATEGORY_IDS.has(categoryId) || categoryId === 'futbol' || categoryId === 'spor'
  const eventCountry = resolveEventCountryFromText(evidenceHay)
  const foreignFootballCountry = detectForeignFootballCountry(evidenceHay)
  const fromTextCountry = eventCountry
  const fromAiCountry =
    country && country !== 'Türkiye' ? findCountryByName(country) : null

  if (foreignFootballCountry && (isSportsCategory || !categoryId)) {
    country = foreignFootballCountry.name
  } else if (
    fromTextCountry &&
    fromTextCountry.name !== 'Türkiye' &&
    !looksLikeDomesticTurkeyContent(evidenceHay)
  ) {
    // Foreign event location (Suriye, Serie A, …) — promote even when AI left Türkiye
    country = fromTextCountry.name
  } else if (fromAiCountry) {
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
    !fromTextCountry &&
    !foreignFootballCountry
  ) {
    country = 'Türkiye'
  }

  let isAbroad = Boolean(country && country !== 'Türkiye')

  if (isAbroad || foreignFootballCountry) {
    city = null
    district = null
    if (foreignFootballCountry) {
      country = foreignFootballCountry.name
      isAbroad = true
    }
  } else {
    // Explicit İl'ün İlçe ilçesi always wins over AI / dateline capital
    if (provinceDistrictPair) {
      city = CITY_DISPLAY.get(provinceDistrictPair.provinceSlug) ?? provinceDistrictPair.provinceSlug
      district = DISTRICT_DISPLAY_NAMES[provinceDistrictPair.districtSlug] || district
    }

    // AI city only if known province AND evidenced in source (not tags)
    if (city && !provinceDistrictPair) {
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
    } else if (city && provinceDistrictPair) {
      city = normalizeDisplayCity(city)
      const slug = normalizeCitySlug(slugifyCity(city))
      if (slug !== provinceDistrictPair.provinceSlug) {
        city = CITY_DISPLAY.get(provinceDistrictPair.provinceSlug) ?? provinceDistrictPair.provinceSlug
        district = DISTRICT_DISPLAY_NAMES[provinceDistrictPair.districtSlug] || null
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

    // Never-local verticals (teknoloji, otomobil, …): clear invented TR city
    if (
      shouldClearCityForNeverLocalVertical(categoryId, {
        keepCityIfEvidenced: true,
        hasExplicitPlaceEvidence: Boolean(
          city &&
            hasExplicitPlaceEvidence(
              evidenceHay,
              normalizeCitySlug(slugifyCity(city)),
            ),
        ),
      })
    ) {
      // Industry/brand/global tech without local civic evidence → no city
      if (
        !provinceDistrictPair &&
        !(city && hasExplicitPlaceEvidence(evidenceHay, normalizeCitySlug(slugifyCity(city))))
      ) {
        city = null
        district = null
      }
    }
  }

  let citySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''

  let districtSlug = ''
  if (!isAbroad) {
    if (provinceDistrictPair) {
      city = CITY_DISPLAY.get(provinceDistrictPair.provinceSlug) ?? provinceDistrictPair.provinceSlug
      citySlug = provinceDistrictPair.provinceSlug
      district = DISTRICT_DISPLAY_NAMES[provinceDistrictPair.districtSlug] || district
      districtSlug = provinceDistrictPair.districtSlug
    }

    const fromTextDistrict = districtSlug
      ? districtSlug
      : extractDistrictSlugFromText(evidenceHay)
    if (fromTextDistrict && !districtSlug) {
      const province = DISTRICT_TO_PROVINCE_SLUG[fromTextDistrict]
      if (province) {
        // District→province always overrides contradictory AI/dateline city
        if (!citySlug || citySlug !== province) {
          city = CITY_DISPLAY.get(province) ?? province
          citySlug = province
        }
        district = DISTRICT_DISPLAY_NAMES[fromTextDistrict] || district
        districtSlug = fromTextDistrict
      }
    }

    // AI district: only via extractDistrictSlugFromText (blocks Fatih/Orta/Göle bare tokens)
    if (!districtSlug && district) {
      if (aiDistrictIsEvidenced(evidenceHay, district)) {
        const resolved = resolveDistrictDisplay(
          district,
          city ? normalizeCitySlug(slugifyCity(city)) : citySlug
        )
        district = resolved.district
        districtSlug = resolved.districtSlug
        if (districtSlug) {
          const province = DISTRICT_TO_PROVINCE_SLUG[districtSlug]
          if (province && (!citySlug || citySlug !== province)) {
            city = CITY_DISPLAY.get(province) ?? province
            citySlug = province
          }
        }
      } else {
        district = null
      }
    } else if (!districtSlug) {
      district = null
    }

    // Yerel category with clear province in text must not keep a contradictory city
    if (isYerelCategoryTree(categoryId) || categoryId === 'yerel-haber') {
      const fromTextCity = extractCityFromText(evidenceHay)
      if (fromTextCity) {
        const textSlug = normalizeCitySlug(slugifyCity(fromTextCity))
        const curSlug = city ? normalizeCitySlug(slugifyCity(city)) : ''
        if (textSlug && curSlug && textSlug !== curSlug) {
          city = fromTextCity
          citySlug = textSlug
          if (districtSlug && DISTRICT_TO_PROVINCE_SLUG[districtSlug] !== textSlug) {
            district = null
            districtSlug = ''
          }
        } else if (textSlug && !curSlug) {
          city = fromTextCity
          citySlug = textSlug
        }
      }
    }

    // Never invent capital for never-local verticals without evidence
    if (isNeverLocalVertical(categoryId) && city) {
      const slug = normalizeCitySlug(slugifyCity(city))
      if (!hasExplicitPlaceEvidence(evidenceHay, slug) && !provinceDistrictPair) {
        city = null
        citySlug = ''
        district = null
        districtSlug = ''
      }
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
