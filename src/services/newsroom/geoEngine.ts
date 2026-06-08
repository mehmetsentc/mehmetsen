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

const TURKISH_CITY_HINTS = [
  'istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya',
  'gaziantep', 'şanlıurfa', 'sanliurfa', 'mersin', 'diyarbakır', 'diyarbakir',
  'kayseri', 'eskişehir', 'eskisehir', 'samsun', 'denizli', 'trabzon',
]

function extractCityFromText(text: string): string | null {
  const lower = text.toLocaleLowerCase('tr-TR')
  for (const hint of TURKISH_CITY_HINTS) {
    if (lower.includes(hint)) {
      return hint.charAt(0).toUpperCase() + hint.slice(1)
    }
  }
  return null
}

export function enrichGeo(rewritten: AiRewriteResult, extraTags: string[] = []): GeoEnrichment {
  let city = rewritten.city?.trim() || null
  let district = rewritten.district?.trim() || null
  const country = rewritten.country?.trim() || 'Türkiye'

  if (!city) {
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
