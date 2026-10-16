/**
 * CITY-SERVICES-1 — small, dependency-free helpers for the city service pages
 * (nöbetçi eczane, etkinlik, iş ilanı). Pure functions so they run on server and client.
 */

export type LatLng = { lat: number; lng: number }

const EARTH_KM = 6371

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** «350 m», «1,2 km», «14 km». */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return ''
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  if (km < 10) return `${km.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`
  return `${Math.round(km)} km`
}

export function hasCoords(p: { lat?: number | null; lng?: number | null }): p is { lat: number; lng: number } {
  return (
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    !(p.lat === 0 && p.lng === 0)
  )
}

/** Google Maps turn-by-turn link (opens the Maps app on phones). */
export function directionsUrl(p: { lat?: number | null; lng?: number | null; name?: string; address?: string }): string | null {
  if (hasCoords(p)) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
  const q = [p.name, p.address].filter(Boolean).join(' ').trim()
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null
}

/** Key-less Google Maps embed (frame-src already allows *.google.com). */
export function mapEmbedUrl(p: LatLng, zoom = 15): string {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}&z=${zoom}&output=embed`
}

/** Today's calendar date in Istanbul, YYYY-MM-DD. */
export function istanbulToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * A duty list is stale when its shift is over: the shift starts on `dutyDate` (evening)
 * and ends next morning, so a list is still valid on the following day until the
 * morning hand-over. We call it stale when it is more than one calendar day old, or
 * when every pharmacy's duty window has already ended.
 */
export function isDutyListStale(
  snapshot: { dutyDate: string | null; groups: Array<{ pharmacies: Array<{ dutyEnd: string | null }> }> } | null,
  now: Date = new Date()
): boolean {
  if (!snapshot?.dutyDate) return false
  const today = istanbulToday(now)
  const dayMs = 24 * 60 * 60 * 1000
  const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${snapshot.dutyDate}T12:00:00Z`)) / dayMs
  if (age > 1) return true
  const ends = snapshot.groups
    .flatMap((g) => g.pharmacies.map((p) => (p.dutyEnd ? Date.parse(p.dutyEnd) : NaN)))
    .filter((t) => Number.isFinite(t))
  return ends.length > 0 && ends.every((t) => t < now.getTime())
}

/** On duty right now (inside the pharmacy's own window). */
export function isOnDutyNow(p: { dutyStart: string | null; dutyEnd: string | null }, now: Date = new Date()): boolean {
  if (!p.dutyStart || !p.dutyEnd) return false
  const s = Date.parse(p.dutyStart)
  const e = Date.parse(p.dutyEnd)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false
  const t = now.getTime()
  return t >= s && t < e
}
