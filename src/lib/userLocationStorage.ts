import { CITY_COOKIE } from '@/lib/i18n'

const LOCATION_STORAGE_KEY = 'nahaber-user-location'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type UserLocationSource = 'profile' | 'geolocation' | 'cookie' | 'fallback'

export interface StoredUserLocation {
  citySlug: string
  cityName: string
  lat?: number | null
  lng?: number | null
  source: UserLocationSource
  updatedAt: number
}

export const DEFAULT_USER_CITY_SLUG = 'istanbul'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
  )
  return match ? decodeURIComponent(match[1]) : null
}

export function readCityCookie(): string | null {
  const raw = readCookie(CITY_COOKIE)?.trim().toLowerCase()
  return raw || null
}

export function setCityCookie(citySlug: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${CITY_COOKIE}=${encodeURIComponent(citySlug)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
}

export function readStoredUserLocation(): StoredUserLocation | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredUserLocation
    if (!parsed?.citySlug?.trim()) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredUserLocation(location: StoredUserLocation): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location))
    setCityCookie(location.citySlug)
  } catch {
    // memory-only fallback
  }
}
