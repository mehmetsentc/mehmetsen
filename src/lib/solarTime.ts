import { TURKISH_PROVINCES } from '@/constants/cities'

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 - date.getTimezoneOffset() / 1440 + 2440587.5
}

/** Approximate timezone offset in hours from longitude (solar local time). */
function timezoneOffsetHours(lng: number, date: Date): number {
  const jan = new Date(date.getFullYear(), 0, 1)
  const jul = new Date(date.getFullYear(), 6, 1)
  const stdOffset = -date.getTimezoneOffset() / 60
  const dst = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset()) !== date.getTimezoneOffset()
  if (dst) return stdOffset
  return lng / 15
}

function sunTimesUtc(lat: number, lng: number, date: Date): { sunrise: Date; sunset: Date } {
  const jd = toJulianDay(date)
  const n = jd - 2451545.0 + 0.0008
  const meanAnomaly = (357.5291 + 0.98560028 * n) % 360
  const center = 1.9148 * Math.sin(meanAnomaly * DEG2RAD)
  const lambda = (meanAnomaly + center + 180 + 102.9372) % 360
  const declination =
    Math.asin(Math.sin(lambda * DEG2RAD) * Math.sin(23.44 * DEG2RAD)) * RAD2DEG

  const latRad = lat * DEG2RAD
  const declRad = declination * DEG2RAD
  const cosHourAngle = (Math.cos(90.833 * DEG2RAD) / (Math.cos(latRad) * Math.cos(declRad))) -
    Math.tan(latRad) * Math.tan(declRad)

  const clamped = Math.max(-1, Math.min(1, cosHourAngle))
  const hourAngle = Math.acos(clamped) * RAD2DEG

  const solarNoon = 12 - lng / 15 - timezoneOffsetHours(lng, date)
  const sunriseHour = solarNoon - hourAngle / 15
  const sunsetHour = solarNoon + hourAngle / 15

  const base = new Date(date)
  base.setHours(0, 0, 0, 0)

  const sunrise = new Date(base.getTime() + sunriseHour * 3600000)
  const sunset = new Date(base.getTime() + sunsetHour * 3600000)
  return { sunrise, sunset }
}

export function getProvinceCoords(citySlug: string): { lat: number; lng: number } | null {
  const province = TURKISH_PROVINCES.find((c) => c.slug === citySlug)
  return province ? { lat: province.lat, lng: province.lng } : null
}

/** True when local solar time at coordinates is between sunrise and sunset. */
export function isDaytimeAtLocation(lat: number, lng: number, date = new Date()): boolean {
  const { sunrise, sunset } = sunTimesUtc(lat, lng, date)
  const now = date.getTime()
  return now >= sunrise.getTime() && now < sunset.getTime()
}

export type AdDisplayTheme = 'light' | 'dark'

export function getAdDisplayThemeFromLocation(
  lat: number,
  lng: number,
  date = new Date()
): AdDisplayTheme {
  return isDaytimeAtLocation(lat, lng, date) ? 'light' : 'dark'
}
