export interface PostLocation {
  lat: number
  lng: number
  city: string
  district?: string
  region?: string
  country?: string
}

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  state?: string
  country?: string
}

interface NominatimResponse {
  address?: NominatimAddress
}

export function toFirestoreLocation(location: PostLocation | null | undefined): PostLocation | null {
  if (!location) return null
  const out: PostLocation = {
    lat: location.lat,
    lng: location.lng,
    city: location.city,
  }
  if (location.district) out.district = location.district
  if (location.region) out.region = location.region
  if (location.country) out.country = location.country
  return out
}

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
}

/** Turkish letters → ASCII before slugify (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c, İ→i). */
export function transliterateTurkish(text: string): string {
  return text
    .split('')
    .map((ch) => TURKISH_CHAR_MAP[ch] ?? ch)
    .join('')
}

export function slugifyCity(city: string): string {
  return transliterateTurkish(city.trim().toLocaleLowerCase('tr-TR'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function cityCategoryId(citySlug: string): string {
  return `city:${citySlug}`
}

export function formatCityLabel(citySlug: string): string {
  return citySlug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ')
}

export function resolveCityFromAddress(address: NominatimAddress): string {
  return (
    address.city?.trim() ||
    address.town?.trim() ||
    address.municipality?.trim() ||
    address.village?.trim() ||
    address.state?.trim() ||
    'Bilinmeyen'
  )
}

export async function reverseGeocode(lat: number, lng: number): Promise<PostLocation | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('accept-language', 'tr')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'NaHaber/1.0' },
  })

  if (!res.ok) return null

  const data = (await res.json()) as NominatimResponse
  const address = data.address
  if (!address) return null

  const city = resolveCityFromAddress(address)
  return {
    lat,
    lng,
    city,
    ...(address.state ? { region: address.state } : {}),
    ...(address.country ? { country: address.country } : {}),
  }
}

function getCurrentPositionOnce(
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Konum desteklenmiyor'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

/**
 * GPS konumu al. Önce yüksek doğruluk dener; masaüstü/Wi‑Fi’de sık görülen
 * timeout / unavailable durumunda düşük doğrulukla yeniden dener.
 */
export async function getCurrentPosition(): Promise<GeolocationPosition> {
  try {
    return await getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000,
    })
  } catch (err) {
    const code = (err as GeolocationPositionError | undefined)?.code
    // PERMISSION_DENIED = 1 → ikinci deneme anlamsız
    if (code === 1) throw err
    return getCurrentPositionOnce({
      enableHighAccuracy: false,
      timeout: 15_000,
      maximumAge: 5 * 60_000,
    })
  }
}

export async function detectCityViaIp(): Promise<{
  lat: number
  lng: number
  city?: string
  citySlug?: string
  source?: string
} | null> {
  // 1) CDN geo (Vercel) — ip2location’a göre TR şehirlerinde daha doğru
  try {
    const res = await fetch('/api/geo/ip', { cache: 'no-store' })
    if (res.ok) {
      const geo = (await res.json()) as {
        citySlug?: string
        cityName?: string
        lat?: number | null
        lng?: number | null
      }
      if (geo.citySlug) {
        return {
          lat: typeof geo.lat === 'number' ? geo.lat : 0,
          lng: typeof geo.lng === 'number' ? geo.lng : 0,
          city: geo.cityName,
          citySlug: geo.citySlug,
          source: 'vercel',
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 2) detect (Vercel header öncelikli + ip2location yedek)
  try {
    const res = await fetch('/api/geo/detect', { cache: 'no-store' })
    if (!res.ok) return null
    const geo = (await res.json()) as {
      lat?: number
      lng?: number
      city?: string
      citySlug?: string
      cityName?: string
      source?: string
    }
    if (geo.citySlug) {
      return {
        lat: typeof geo.lat === 'number' ? geo.lat : 0,
        lng: typeof geo.lng === 'number' ? geo.lng : 0,
        city: geo.cityName || geo.city,
        citySlug: geo.citySlug,
        source: geo.source,
      }
    }
    if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') return null
    if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null
    if (geo.lat === 0 && geo.lng === 0) return null
    return { lat: geo.lat, lng: geo.lng, city: geo.city, source: geo.source }
  } catch {
    return null
  }
}

export async function detectCurrentLocation(): Promise<PostLocation | null> {
  try {
    const position = await getCurrentPosition()
    return reverseGeocode(position.coords.latitude, position.coords.longitude)
  } catch {
    return null
  }
}
