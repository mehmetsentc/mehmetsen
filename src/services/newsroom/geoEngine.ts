/**
 * Geo Engine — enriches city/district/country and location tags.
 */
import { slugifyCity } from '@/lib/location'
import { normalizeCitySlug } from '@/constants/cities'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

export interface GeoEnrichment {
  city: string | null
  district: string | null
  country: string
  citySlug: string
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

// Build lookup: ASCII slug → display name
const CITY_DISPLAY: Map<string, string> = new Map(TURKISH_PROVINCES_ALL)

function extractCityFromText(text: string): string | null {
  // Normalize to ASCII-ish for matching
  const lower = text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')

  for (const [slug] of TURKISH_PROVINCES_ALL) {
    if (lower.includes(slug)) {
      return CITY_DISPLAY.get(slug) ?? slug
    }
  }
  return null
}

/** Normalize an arbitrary city string to its canonical Turkish display name. */
function normalizeDisplayCity(raw: string): string {
  const slug = raw
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '')
  return CITY_DISPLAY.get(slug) ?? raw
}

export function enrichGeo(rewritten: AiRewriteResult, extraTags: string[] = []): GeoEnrichment {
  let city = rewritten.city?.trim() || null
  let district = rewritten.district?.trim() || null
  const country = rewritten.country?.trim() || 'Türkiye'

  if (city) {
    // Normalize to canonical display name (e.g. "diyarbakır" → "Diyarbakır")
    city = normalizeDisplayCity(city)
  } else if (country === 'Türkiye' || !country) {
    // Yalnızca Türkiye haberleri için metinden şehir çıkar.
    // Dünya haberleri (country !== 'Türkiye') metinde Türk şehri geçse bile tag ekleme.
    const haystack = `${rewritten.title} ${rewritten.description}`
    city = extractCityFromText(haystack)
  }

  const citySlug = city ? normalizeCitySlug(slugifyCity(city)) : ''
  const tags = [...rewritten.tags]

  if (citySlug && !tags.includes(citySlug)) {
    tags.unshift(citySlug)
  }
  if (district) {
    const d = district.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')
    if (!tags.includes(d)) tags.push(d)
  }
  for (const tag of extraTags) {
    if (!tags.includes(tag)) tags.push(tag)
  }

  return { city, district, country, citySlug, tags }
}

export const geoEngine = {
  enrich: enrichGeo,
}
