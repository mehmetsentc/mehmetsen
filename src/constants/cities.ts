import { transliterateTurkish } from '@/lib/location'
import {
  DISTRICT_NAMES_FROM_DATA,
  DISTRICT_TO_PROVINCE_FROM_DATA,
  PROVINCE_DISTRICTS,
} from '@/constants/turkishDistricts'

/** Turkish province (il) — slug, display name, approximate centroid for geo sorting. */
export interface TurkishProvince {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
}

/**
 * All 81 Turkish provinces. Used for event city filters, Biletix Solr city
 * mapping, Bubilet city URLs (`/<slug>`), and location-based event sorting.
 * Sorted alphabetically by Turkish display name.
 */
export const TURKISH_PROVINCES: readonly TurkishProvince[] = [
  { id: 'city:adana', slug: 'adana', name: 'Adana', lat: 37.0, lng: 35.3213 },
  { id: 'city:adiyaman', slug: 'adiyaman', name: 'Adıyaman', lat: 37.7648, lng: 38.2786 },
  { id: 'city:afyonkarahisar', slug: 'afyonkarahisar', name: 'Afyonkarahisar', lat: 38.7507, lng: 30.5567 },
  { id: 'city:agri', slug: 'agri', name: 'Ağrı', lat: 39.7191, lng: 43.0503 },
  { id: 'city:aksaray', slug: 'aksaray', name: 'Aksaray', lat: 38.3687, lng: 34.037 },
  { id: 'city:amasya', slug: 'amasya', name: 'Amasya', lat: 40.6499, lng: 35.8353 },
  { id: 'city:ankara', slug: 'ankara', name: 'Ankara', lat: 39.9334, lng: 32.8597 },
  { id: 'city:antalya', slug: 'antalya', name: 'Antalya', lat: 36.8969, lng: 30.7133 },
  { id: 'city:ardahan', slug: 'ardahan', name: 'Ardahan', lat: 41.1105, lng: 42.7022 },
  { id: 'city:artvin', slug: 'artvin', name: 'Artvin', lat: 41.1828, lng: 41.8183 },
  { id: 'city:aydin', slug: 'aydin', name: 'Aydın', lat: 37.856, lng: 27.8416 },
  { id: 'city:balikesir', slug: 'balikesir', name: 'Balıkesir', lat: 39.6484, lng: 27.8826 },
  { id: 'city:bartin', slug: 'bartin', name: 'Bartın', lat: 41.5811, lng: 32.461 },
  { id: 'city:batman', slug: 'batman', name: 'Batman', lat: 37.8812, lng: 41.1351 },
  { id: 'city:bayburt', slug: 'bayburt', name: 'Bayburt', lat: 40.2552, lng: 40.2249 },
  { id: 'city:bilecik', slug: 'bilecik', name: 'Bilecik', lat: 40.0567, lng: 30.0665 },
  { id: 'city:bingol', slug: 'bingol', name: 'Bingöl', lat: 38.8854, lng: 40.4966 },
  { id: 'city:bitlis', slug: 'bitlis', name: 'Bitlis', lat: 38.3938, lng: 42.1232 },
  { id: 'city:bolu', slug: 'bolu', name: 'Bolu', lat: 40.576, lng: 31.5788 },
  { id: 'city:burdur', slug: 'burdur', name: 'Burdur', lat: 37.4613, lng: 30.0665 },
  { id: 'city:bursa', slug: 'bursa', name: 'Bursa', lat: 40.1885, lng: 29.061 },
  { id: 'city:canakkale', slug: 'canakkale', name: 'Çanakkale', lat: 40.1553, lng: 26.4142 },
  { id: 'city:cankiri', slug: 'cankiri', name: 'Çankırı', lat: 40.6013, lng: 33.6134 },
  { id: 'city:corum', slug: 'corum', name: 'Çorum', lat: 40.5506, lng: 34.9556 },
  { id: 'city:denizli', slug: 'denizli', name: 'Denizli', lat: 37.7765, lng: 29.0864 },
  { id: 'city:diyarbakir', slug: 'diyarbakir', name: 'Diyarbakır', lat: 37.9144, lng: 40.2306 },
  { id: 'city:duzce', slug: 'duzce', name: 'Düzce', lat: 40.8438, lng: 31.1565 },
  { id: 'city:edirne', slug: 'edirne', name: 'Edirne', lat: 41.6771, lng: 26.5557 },
  { id: 'city:elazig', slug: 'elazig', name: 'Elazığ', lat: 38.681, lng: 39.2264 },
  { id: 'city:erzincan', slug: 'erzincan', name: 'Erzincan', lat: 39.75, lng: 39.5 },
  { id: 'city:erzurum', slug: 'erzurum', name: 'Erzurum', lat: 39.9055, lng: 41.2658 },
  { id: 'city:eskisehir', slug: 'eskisehir', name: 'Eskişehir', lat: 39.7767, lng: 30.5206 },
  { id: 'city:gaziantep', slug: 'gaziantep', name: 'Gaziantep', lat: 37.0662, lng: 37.3833 },
  { id: 'city:giresun', slug: 'giresun', name: 'Giresun', lat: 40.9128, lng: 38.3895 },
  { id: 'city:gumushane', slug: 'gumushane', name: 'Gümüşhane', lat: 40.4386, lng: 39.5086 },
  { id: 'city:hakkari', slug: 'hakkari', name: 'Hakkari', lat: 37.5744, lng: 43.7408 },
  { id: 'city:hatay', slug: 'hatay', name: 'Hatay', lat: 36.4018, lng: 36.3498 },
  { id: 'city:igdir', slug: 'igdir', name: 'Iğdır', lat: 39.888, lng: 44.0048 },
  { id: 'city:isparta', slug: 'isparta', name: 'Isparta', lat: 37.7648, lng: 30.5566 },
  { id: 'city:istanbul', slug: 'istanbul', name: 'İstanbul', lat: 41.0082, lng: 28.9784 },
  { id: 'city:izmir', slug: 'izmir', name: 'İzmir', lat: 38.4237, lng: 27.1428 },
  { id: 'city:kahramanmaras', slug: 'kahramanmaras', name: 'Kahramanmaraş', lat: 37.5858, lng: 36.9371 },
  { id: 'city:karabuk', slug: 'karabuk', name: 'Karabük', lat: 41.2061, lng: 32.6204 },
  { id: 'city:karaman', slug: 'karaman', name: 'Karaman', lat: 37.1759, lng: 33.2287 },
  { id: 'city:kars', slug: 'kars', name: 'Kars', lat: 40.6013, lng: 43.0975 },
  { id: 'city:kastamonu', slug: 'kastamonu', name: 'Kastamonu', lat: 41.3887, lng: 33.7827 },
  { id: 'city:kayseri', slug: 'kayseri', name: 'Kayseri', lat: 38.7312, lng: 35.4787 },
  { id: 'city:kirikkale', slug: 'kirikkale', name: 'Kırıkkale', lat: 39.8468, lng: 33.5153 },
  { id: 'city:kirklareli', slug: 'kirklareli', name: 'Kırklareli', lat: 41.7333, lng: 27.2167 },
  { id: 'city:kirsehir', slug: 'kirsehir', name: 'Kırşehir', lat: 39.1425, lng: 34.1709 },
  { id: 'city:kilis', slug: 'kilis', name: 'Kilis', lat: 36.7161, lng: 37.115 },
  { id: 'city:kocaeli', slug: 'kocaeli', name: 'Kocaeli', lat: 40.8533, lng: 29.8815 },
  { id: 'city:konya', slug: 'konya', name: 'Konya', lat: 37.8746, lng: 32.4932 },
  { id: 'city:kutahya', slug: 'kutahya', name: 'Kütahya', lat: 39.4167, lng: 29.9833 },
  { id: 'city:malatya', slug: 'malatya', name: 'Malatya', lat: 38.3552, lng: 38.3095 },
  { id: 'city:manisa', slug: 'manisa', name: 'Manisa', lat: 38.6191, lng: 27.4289 },
  { id: 'city:mardin', slug: 'mardin', name: 'Mardin', lat: 37.3212, lng: 40.7245 },
  { id: 'city:mersin', slug: 'mersin', name: 'Mersin', lat: 36.8121, lng: 34.6415 },
  { id: 'city:mugla', slug: 'mugla', name: 'Muğla', lat: 37.2153, lng: 28.3636 },
  { id: 'city:mus', slug: 'mus', name: 'Muş', lat: 38.9462, lng: 41.7539 },
  { id: 'city:nevsehir', slug: 'nevsehir', name: 'Nevşehir', lat: 38.6939, lng: 34.6857 },
  { id: 'city:nigde', slug: 'nigde', name: 'Niğde', lat: 37.9667, lng: 34.6833 },
  { id: 'city:ordu', slug: 'ordu', name: 'Ordu', lat: 40.9839, lng: 37.8764 },
  { id: 'city:osmaniye', slug: 'osmaniye', name: 'Osmaniye', lat: 37.0742, lng: 36.2478 },
  { id: 'city:rize', slug: 'rize', name: 'Rize', lat: 41.0201, lng: 40.5234 },
  { id: 'city:sakarya', slug: 'sakarya', name: 'Sakarya', lat: 40.7569, lng: 30.3783 },
  { id: 'city:samsun', slug: 'samsun', name: 'Samsun', lat: 41.2867, lng: 36.33 },
  { id: 'city:siirt', slug: 'siirt', name: 'Siirt', lat: 37.9333, lng: 41.95 },
  { id: 'city:sinop', slug: 'sinop', name: 'Sinop', lat: 42.0231, lng: 35.1531 },
  { id: 'city:sivas', slug: 'sivas', name: 'Sivas', lat: 39.7477, lng: 37.0179 },
  { id: 'city:sanliurfa', slug: 'sanliurfa', name: 'Şanlıurfa', lat: 37.1591, lng: 38.7969 },
  { id: 'city:sirnak', slug: 'sirnak', name: 'Şırnak', lat: 37.4187, lng: 42.4918 },
  { id: 'city:tekirdag', slug: 'tekirdag', name: 'Tekirdağ', lat: 40.9833, lng: 27.5167 },
  { id: 'city:tokat', slug: 'tokat', name: 'Tokat', lat: 40.3167, lng: 36.55 },
  { id: 'city:trabzon', slug: 'trabzon', name: 'Trabzon', lat: 41.0027, lng: 39.7168 },
  { id: 'city:tunceli', slug: 'tunceli', name: 'Tunceli', lat: 39.1079, lng: 39.5401 },
  { id: 'city:usak', slug: 'usak', name: 'Uşak', lat: 38.6823, lng: 29.4082 },
  { id: 'city:van', slug: 'van', name: 'Van', lat: 38.4891, lng: 43.4089 },
  { id: 'city:yalova', slug: 'yalova', name: 'Yalova', lat: 40.65, lng: 29.2667 },
  { id: 'city:yozgat', slug: 'yozgat', name: 'Yozgat', lat: 39.8181, lng: 34.8147 },
  { id: 'city:zonguldak', slug: 'zonguldak', name: 'Zonguldak', lat: 41.4564, lng: 31.7987 },
] as const

/** @deprecated alias — all 81 provinces; kept for existing imports. */
export const CITY_CATEGORIES = TURKISH_PROVINCES

export type CityCategory = (typeof TURKISH_PROVINCES)[number]

const PROVINCE_BY_SLUG = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p]))

/**
 * Slugs produced before Turkish-aware slugifyCity (dotless ı stripped as non-ascii).
 * Keys are the broken values; values are canonical province slugs.
 */
const LEGACY_BROKEN_CITY_SLUGS: Readonly<Record<string, string>> = {
  'ad-yaman': 'adiyaman',
  agr: 'agri',
  'ayd-n': 'aydin',
  'bal-kesir': 'balikesir',
  'bart-n': 'bartin',
  'cank-r': 'cankiri',
  'diyarbak-r': 'diyarbakir',
  'elaz-g': 'elazig',
  'gd-r': 'igdir',
  'k-r-kkale': 'kirikkale',
  'k-rklareli': 'kirklareli',
  'k-rsehir': 'kirsehir',
  'sanl-urfa': 'sanliurfa',
  's-rnak': 'sirnak',
}

/** Slug → approximate province centroid (for event distance sorting). */
export const PROVINCE_COORDS_BY_SLUG: Record<string, { lat: number; lng: number }> =
  Object.fromEntries(TURKISH_PROVINCES.map((p) => [p.slug, { lat: p.lat, lng: p.lng }]))

/**
 * Biletix Solr `fq=city:` values use Turkish display names with proper diacritics
 * (e.g. "İstanbul", "Şanlıurfa"). Verified against the live Solr facet index;
 * override here only when Solr uses a different spelling than our display name.
 */
const BILETIX_CITY_OVERRIDES: Partial<Record<string, string>> = {
  // No overrides needed today — getCityCategoryName matches Solr for all tested il.
}

export function getCityCategoryName(citySlug: string): string {
  const found = PROVINCE_BY_SLUG.get(normalizeCitySlug(citySlug))
  if (found) return found.name
  return citySlug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1))
    .join(' ')
}

/** Resolve a city slug to the Biletix Solr `city:` filter value. */
export function getBiletixSolrCityName(citySlug: string): string {
  const slug = normalizeCitySlug(citySlug)
  return BILETIX_CITY_OVERRIDES[slug] ?? getCityCategoryName(slug)
}

/** True when the slug is one of the 81 Turkish provinces. */
export function isTurkishProvinceSlug(citySlug: string): boolean {
  return PROVINCE_BY_SLUG.has(normalizeCitySlug(citySlug))
}

/** Legacy district slug aliases (typos / older ingested news). */
const LEGACY_DISTRICT_ALIASES: Readonly<Record<string, string>> = {
  yenishehir: 'mersin',
}

/** District slug → parent province slug (973 ilçe). */
export const DISTRICT_TO_PROVINCE_SLUG: Readonly<Record<string, string>> = {
  ...DISTRICT_TO_PROVINCE_FROM_DATA,
  ...LEGACY_DISTRICT_ALIASES,
}

/** District slug → Turkish display name. */
export const DISTRICT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ...DISTRICT_NAMES_FROM_DATA,
  yenishehir: 'Yenişehir',
}

/** Returns all districts for a given province slug, sorted by display name. */
export function getDistrictsForProvince(provinceSlug: string): Array<{ slug: string; name: string }> {
  const districts = PROVINCE_DISTRICTS[normalizeCitySlug(provinceSlug)]
  if (!districts?.length) return []
  return districts.map((d) => ({ slug: d.slug, name: d.name }))
}

function normalizeTrAscii(text: string): string {
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
 * Kısa / günlük dil ile çakışan ilçeler — yalnızca güçlü yer belirtisi ile kabul.
 * Örn: Göle ↔ "gol"; Orta / Olur günlük kelime.
 */
const AMBIGUOUS_SHORT_DISTRICT_SLUGS = new Set([
  'gole', // gol / goller
  'orta',
  'olur',
  'tire',
  'kale',
  'han',
  'mut',
  'sur',
  'tut',
  'ula',
  'of',
  'bor',
  'cal',
  'can',
  'cat',
  'cay',
  'kas',
])

/** İlçe için güçlü yer kanıtı: "Göle'de", "Göle ilçesi" vb. (çıplak token yetmez). */
function hasStrongDistrictEvidence(normalized: string, token: string): boolean {
  const t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const locative = new RegExp(
    `(?<![a-z0-9])${t}(?:['']?(?:da|de|ta|te|dan|den|tan|ten|nin|nun|in|un)|\\s+ilce\\w*)(?![a-z0-9])|` +
      `ilce\\w*\\s+${t}(?![a-z0-9])`,
    'i'
  )
  return locative.test(normalized)
}

/**
 * Metinden ilçe slug çıkar (uzun isim öncelikli).
 * `normalized` ASCII-Türkçe normalize edilmiş olmalı veya ham metin olabilir.
 */
export function extractDistrictSlugFromText(text: string): string | null {
  const normalized = normalizeTrAscii(text)
  const entries = Object.entries(DISTRICT_DISPLAY_NAMES).sort(
    (a, b) => b[1].length - a[1].length || b[0].length - a[0].length
  )
  for (const [slug, name] of entries) {
    const nameNorm = normalizeTrAscii(name)
    if (nameNorm.length < 4 && slug.length < 4) continue
    if (AMBIGUOUS_SHORT_DISTRICT_SLUGS.has(slug)) {
      if (
        hasStrongDistrictEvidence(normalized, nameNorm) ||
        hasStrongDistrictEvidence(normalized, slug)
      ) {
        return slug
      }
      continue
    }
    const nameRe = new RegExp(`(?<![a-z0-9])${nameNorm.replace(/\s+/g, '\\s*')}(?![a-z0-9])`)
    const slugRe = new RegExp(`(?<![a-z0-9])${slug}(?![a-z0-9])`)
    if (nameRe.test(normalized) || slugRe.test(normalized)) {
      return slug
    }
  }
  return null
}

/** Map user district or province slug to province slug used on ingested news. */
export function resolveLocalNewsCitySlug(rawSlug: string): string {
  return normalizeCitySlug(rawSlug)
}

/** All provinces as filter options (slug + display name), alphabetically by name. */
export function getAllProvinceOptions(): Array<{ slug: string; name: string }> {
  return TURKISH_PROVINCES.map((p) => ({ slug: p.slug, name: p.name }))
}

/** Turkish-aware normalization for province name/slug search (İ→i, Ş→s, etc.). */
export function normalizeProvinceSearchTerm(raw: string): string {
  return transliterateTurkish(raw)
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const ALL_PROVINCE_OPTIONS = getAllProvinceOptions()

/** Filter provinces by typed query; empty query returns the first `limit` alphabetically. */
export function filterProvincesByQuery(query: string, limit = 8): Array<{ slug: string; name: string }> {
  const normalized = normalizeProvinceSearchTerm(query)
  if (!normalized) return ALL_PROVINCE_OPTIONS.slice(0, limit)

  return ALL_PROVINCE_OPTIONS.filter((p) => {
    const nameNorm = normalizeProvinceSearchTerm(p.name)
    const slugNorm = normalizeProvinceSearchTerm(p.slug.replace(/-/g, ' '))
    return nameNorm.includes(normalized) || slugNorm.includes(normalized)
  }).slice(0, limit)
}

/**
 * Resolve free-text city input to the nearest province slug.
 * Handles exact names, slugified input, prefix/substring matches, and rough typos.
 */
export function fuzzyMatchProvinceSlug(input: string): string | null {
  const normalized = normalizeProvinceSearchTerm(input)
  if (!normalized) return null

  const slugFromInput = normalized.replace(/\s+/g, '-').replace(/-+/g, '-')
  if (PROVINCE_BY_SLUG.has(slugFromInput)) return slugFromInput

  for (const p of ALL_PROVINCE_OPTIONS) {
    const nameNorm = normalizeProvinceSearchTerm(p.name)
    if (nameNorm === normalized) return p.slug
  }

  for (const p of ALL_PROVINCE_OPTIONS) {
    const nameNorm = normalizeProvinceSearchTerm(p.name)
    if (nameNorm.startsWith(normalized)) return p.slug
  }

  for (const p of ALL_PROVINCE_OPTIONS) {
    const nameNorm = normalizeProvinceSearchTerm(p.name)
    if (nameNorm.includes(normalized)) return p.slug
  }

  if (normalized.length >= 3) {
    const prefix = normalized.slice(0, 3)
    const partial = ALL_PROVINCE_OPTIONS.find((p) =>
      normalizeProvinceSearchTerm(p.name).includes(prefix)
    )
    if (partial) return partial.slug
  }

  return null
}

/** Map legacy or mistyped city slugs to canonical province slugs. */
export function normalizeCitySlug(raw: string): string {
  const slug = raw.trim().toLowerCase()
  if (!slug) return slug
  if (PROVINCE_BY_SLUG.has(slug)) return slug

  const legacy = LEGACY_BROKEN_CITY_SLUGS[slug]
  if (legacy) return legacy

  const fromDistrict = DISTRICT_TO_PROVINCE_SLUG[slug]
  if (fromDistrict) return fromDistrict

  const fuzzy = fuzzyMatchProvinceSlug(slug.replace(/-/g, ' '))
  if (fuzzy) return fuzzy

  return slug
}

const EARTH_RADIUS_KM = 6371

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const rLat1 = toRadians(lat1)
  const rLat2 = toRadians(lat2)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Nearest Turkish province slug for GPS coordinates. */
export function nearestProvinceSlug(lat: number, lng: number): string {
  let bestSlug = 'istanbul'
  let bestDist = Infinity

  for (const p of TURKISH_PROVINCES) {
    const dist = haversineKm(lat, lng, p.lat, p.lng)
    if (dist < bestDist) {
      bestDist = dist
      bestSlug = p.slug
    }
  }

  return bestSlug
}

export function mergeCityCategories(
  recent: Array<{ slug: string; name: string }>
): Array<{ id: string; slug: string; name: string }> {
  const merged = recent
    .map((city) => {
      const slug = city.slug.trim()
      if (!slug) return null
      return {
        id: `city:${slug}`,
        slug,
        name: city.name.trim() || getCityCategoryName(slug),
      }
    })
    .filter((city): city is { id: string; slug: string; name: string } => city !== null)

  if (merged.length > 0) return merged
  return TURKISH_PROVINCES.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))
}
