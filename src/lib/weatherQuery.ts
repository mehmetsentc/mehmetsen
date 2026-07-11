import { TURKISH_PROVINCES } from '@/constants/cities'

export interface WeatherCoords {
  lat: number
  lng: number
}

/** Build a WeatherAPI `q` parameter from province slug and optional coordinates. */
export function buildWeatherQuery(citySlug: string, coords?: WeatherCoords | null): string {
  if (coords?.lat != null && coords?.lng != null) {
    return `${coords.lat},${coords.lng}`
  }

  const province = TURKISH_PROVINCES.find((p) => p.slug === citySlug)
  if (province) {
    return `${province.lat},${province.lng}`
  }

  return citySlug
}
