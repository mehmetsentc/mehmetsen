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

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Konum desteklenmiyor'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 60_000,
    })
  })
}

export async function detectCurrentLocation(): Promise<PostLocation | null> {
  try {
    const position = await getCurrentPosition()
    return reverseGeocode(position.coords.latitude, position.coords.longitude)
  } catch {
    return null
  }
}
