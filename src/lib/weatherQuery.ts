import { TURKISH_PROVINCES } from '@/constants/cities'

export interface WeatherCoords {
  lat: number
  lng: number
}

/**
 * Round to 2 decimals (~1.1 km). Full-precision geolocation coordinates can
 * resolve to a specific WeatherAPI station that occasionally returns stale data
 * (observed: exact Istanbul coords stuck on the previous night's reading).
 * Rounding avoids those broken exact-station matches and also improves CDN cache
 * hit rates by collapsing many nearby coordinates onto the same query.
 */
function roundCoord(n: number): number {
  return Math.round(n * 100) / 100
}

/** Build a WeatherAPI `q` parameter from province slug and optional coordinates. */
export function buildWeatherQuery(citySlug: string, coords?: WeatherCoords | null): string {
  if (coords?.lat != null && coords?.lng != null) {
    return `${roundCoord(coords.lat)},${roundCoord(coords.lng)}`
  }

  const province = TURKISH_PROVINCES.find((p) => p.slug === citySlug)
  if (province) {
    return `${roundCoord(province.lat)},${roundCoord(province.lng)}`
  }

  return citySlug
}
