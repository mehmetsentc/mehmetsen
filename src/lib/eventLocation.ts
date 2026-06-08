import { PROVINCE_COORDS_BY_SLUG } from '@/constants/cities'
import type { NaEvent } from '@/types/event'

/**
 * Location-aware ordering for events.
 *
 * Two strategies, picked automatically:
 *   1. When the user's precise coordinates are known (browser geolocation
 *      granted), events are sorted by haversine distance to the user. Event
 *      coordinates come from the provider (`event.lat`/`event.lng`) or, failing
 *      that, from a city-centroid lookup. Soonest start time breaks ties.
 *   2. Otherwise events in the user's city come first, then everything else,
 *      each tier ordered by soonest upcoming start time.
 */

export interface UserCoords {
  lat: number
  lng: number
}

export interface SortEventsOptions {
  /** The user's city slug (from profile location or the selected filter). */
  userCitySlug?: string | null
  /** Precise user coordinates, if geolocation was granted. */
  userCoords?: UserCoords | null
}

/** Approximate centroids for all 81 Turkish provinces (lat, lng). */
const CITY_COORDS: Record<string, UserCoords> = PROVINCE_COORDS_BY_SLUG

const EARTH_RADIUS_KM = 6371

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: UserCoords, b: UserCoords): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Resolves coordinates for an event: explicit venue coords, else city centroid. */
function resolveEventCoords(event: NaEvent): UserCoords | null {
  if (event.lat !== undefined && event.lng !== undefined) {
    return { lat: event.lat, lng: event.lng }
  }
  const slug = event.citySlug?.trim().toLowerCase()
  if (slug && CITY_COORDS[slug]) return CITY_COORDS[slug]
  return null
}

function startTime(event: NaEvent): number {
  const t = new Date(event.startsAt).getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/** Returns user coordinates, deriving them from the city slug when no GPS. */
function resolveUserCoords(options: SortEventsOptions): UserCoords | null {
  if (options.userCoords) return options.userCoords
  const slug = options.userCitySlug?.trim().toLowerCase()
  if (slug && CITY_COORDS[slug]) return CITY_COORDS[slug]
  return null
}

/**
 * Returns a new array of events sorted by relevance to the user's location.
 * Pure (does not mutate the input).
 */
export function sortEventsByLocation(
  events: NaEvent[],
  options: SortEventsOptions = {}
): NaEvent[] {
  const userCitySlug = options.userCitySlug?.trim().toLowerCase() || null

  // Strategy 1: distance-based (only when we have *precise* user coords).
  if (options.userCoords) {
    const userCoords = options.userCoords
    return [...events].sort((a, b) => {
      const ca = resolveEventCoords(a)
      const cb = resolveEventCoords(b)
      const da = ca ? haversineKm(userCoords, ca) : Number.POSITIVE_INFINITY
      const db = cb ? haversineKm(userCoords, cb) : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return startTime(a) - startTime(b)
    })
  }

  // Strategy 2: same-city first, then soonest upcoming.
  if (userCitySlug) {
    // If we know a centroid for the user's city, use distance as a secondary
    // signal so "nearby" cities float above far ones; otherwise pure recency.
    const userCoords = resolveUserCoords(options)
    return [...events].sort((a, b) => {
      const aSame = a.citySlug?.trim().toLowerCase() === userCitySlug ? 0 : 1
      const bSame = b.citySlug?.trim().toLowerCase() === userCitySlug ? 0 : 1
      if (aSame !== bSame) return aSame - bSame

      if (userCoords) {
        const ca = resolveEventCoords(a)
        const cb = resolveEventCoords(b)
        const da = ca ? haversineKm(userCoords, ca) : Number.POSITIVE_INFINITY
        const db = cb ? haversineKm(userCoords, cb) : Number.POSITIVE_INFINITY
        if (da !== db) return da - db
      }
      return startTime(a) - startTime(b)
    })
  }

  // No location signal at all: soonest upcoming first.
  return [...events].sort((a, b) => startTime(a) - startTime(b))
}
