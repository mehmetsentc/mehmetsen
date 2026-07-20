import type { WeatherApiResponse, WeatherData } from '@/types/weather'

const BASE_URL = 'https://api.weatherapi.com/v1'

function getApiKey(): string {
  const key = process.env.WEATHER_API_KEY
  if (!key) throw new Error('WEATHER_API_KEY is not set')
  return key
}

/**
 * Normalize a WeatherAPI `q` value. High-precision `lat,lng` coordinates can
 * resolve to a specific WeatherAPI station that intermittently returns stale
 * data (observed: exact Istanbul coords stuck on the previous night's reading,
 * while nearby rounded coords were fresh). Rounding coordinates to 2 decimals
 * (~1.1 km) avoids those broken exact-station matches and improves cache hits.
 * Non-coordinate queries (city names) are returned unchanged.
 */
function normalizeWeatherQuery(city: string): string {
  const match = city.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return city.trim()
  const lat = Math.round(parseFloat(match[1]) * 100) / 100
  const lng = Math.round(parseFloat(match[2]) * 100) / 100
  return `${lat},${lng}`
}

/**
 * Fetch current weather + n-day forecast + alerts for a city.
 * Server-side only (uses WEATHER_API_KEY).
 */
export async function fetchWeather(city: string, days = 7): Promise<WeatherData> {
  const key = getApiKey()
  const q = normalizeWeatherQuery(city)
  const url = `${BASE_URL}/forecast.json?key=${key}&q=${encodeURIComponent(q)}&days=${days}&aqi=no&alerts=yes&lang=tr`

  const res = await fetch(url, { next: { revalidate: 300 } }) // 5-min ISR
  if (!res.ok) {
    throw new Error(`WeatherAPI error ${res.status}: ${await res.text()}`)
  }

  const data: WeatherApiResponse = await res.json()
  const forecast = data.forecast?.forecastday ?? []
  const today = forecast[0]
  const fetchedAt = Date.now()
  const isDay = resolveIsDay({
    localtime: data.location?.localtime,
    sunrise: today?.astro?.sunrise,
    sunset: today?.astro?.sunset,
    apiIsDay: data.current?.is_day,
    conditionIcon: data.current?.condition?.icon,
  })

  return {
    location: data.location,
    current: { ...data.current, is_day: isDay },
    forecast,
    alerts: data.alerts?.alert ?? [],
    fetchedAt,
  }
}

/**
 * Major Turkish cities for batch weather news generation.
 */
export const TURKISH_WEATHER_CITIES = [
  'Istanbul',
  'Ankara',
  'Izmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Mersin',
  'Canakkale',
  'Trabzon',
  'Erzurum',
  'Samsun',
  'Eskisehir',
  'Kayseri',
]

/**
 * Translate condition code → Turkish alert type (for breaking news).
 * Returns null if not an alert-worthy condition.
 */
export function getAlertType(conditionCode: number): string | null {
  // WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
  if ([1087, 1273, 1276].includes(conditionCode)) return 'Fırtına'
  if ([1117, 1237, 1261, 1264].includes(conditionCode)) return 'Kar Fırtınası'
  if ([1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201].includes(conditionCode)) return 'Yoğun Yağış'
  if (conditionCode === 1135 || conditionCode === 1147) return 'Yoğun Sis'
  return null
}

/**
 * Check if temperature is extreme (breaking news threshold).
 */
export function isExtremeTemperature(tempC: number): boolean {
  return tempC >= 38 || tempC <= -15
}

/**
 * Map wind speed to alert description.
 */
export function getWindAlert(windKph: number): string | null {
  if (windKph >= 90) return 'Çok Kuvvetli Fırtına'
  if (windKph >= 60) return 'Kuvvetli Rüzgar'
  if (windKph >= 40) return 'Sert Rüzgar'
  return null
}

/** Parse WeatherAPI localtime: "2026-07-20 17:00" as a wall-clock Date. */
export function parseWeatherLocaltime(localtime: string): Date | null {
  const match = localtime.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  )
}

/** Parse WeatherAPI astro clock: "05:53 AM" / "08:13 PM" on a given YMD date. */
export function parseWeatherAstroTime(astroTime: string, dateYmd: string): Date | null {
  const match = astroTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  const dateMatch = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match || !dateMatch) return null

  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3].toUpperCase()
  if (meridiem === 'PM' && hour !== 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0

  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute,
    0,
    0
  )
}

/**
 * Authoritative day/night flag for icons and gradients.
 * Prefer sunrise/sunset + local wall clock over a possibly stale API `is_day`
 * (CDN can keep a night response for several minutes after sunrise).
 */
export function resolveIsDay(options: {
  localtime?: string
  sunrise?: string
  sunset?: string
  apiIsDay?: number
  conditionIcon?: string
  /** Advance localtime by elapsed ms since fetch (keeps CDN-stale payloads fresh). */
  advanceMs?: number
}): number {
  const { localtime, sunrise, sunset, apiIsDay, conditionIcon, advanceMs = 0 } = options

  if (localtime && sunrise && sunset) {
    const base = parseWeatherLocaltime(localtime)
    const dateYmd = localtime.trim().slice(0, 10)
    const rise = parseWeatherAstroTime(sunrise, dateYmd)
    const set = parseWeatherAstroTime(sunset, dateYmd)
    if (base && rise && set) {
      const now = new Date(base.getTime() + Math.max(0, advanceMs))
      return now >= rise && now < set ? 1 : 0
    }
  }

  if (conditionIcon?.includes('/night/')) return 0
  if (conditionIcon?.includes('/day/')) return 1

  return apiIsDay ? 1 : 0
}

/** Effective is_day for a WeatherData payload, correcting stale CDN night flags. */
export function getEffectiveIsDay(data: WeatherData, nowMs = Date.now()): number {
  const today = data.forecast?.[0]
  const advanceMs =
    typeof data.fetchedAt === 'number' && data.fetchedAt > 0
      ? Math.max(0, nowMs - data.fetchedAt)
      : 0

  return resolveIsDay({
    localtime: data.location?.localtime,
    sunrise: today?.astro?.sunrise,
    sunset: today?.astro?.sunset,
    apiIsDay: data.current?.is_day,
    conditionIcon: data.current?.condition?.icon,
    advanceMs,
  })
}

/**
 * Get weather description emoji for a condition code.
 */
export function conditionEmoji(conditionCode: number, isDay: number): string {
  if (conditionCode === 1000) return isDay ? '☀️' : '🌙'
  if (conditionCode <= 1009) return '⛅'
  if (conditionCode <= 1030) return '🌤️'
  if ([1063, 1180, 1183].includes(conditionCode)) return '🌦️'
  if (conditionCode <= 1201) return '🌧️'
  if (conditionCode <= 1237) return '❄️'
  if (conditionCode <= 1264) return '🌨️'
  if ([1273, 1276, 1087].includes(conditionCode)) return '⛈️'
  return '🌡️'
}

/**
 * Turkish day names for forecasts.
 */
export function turkishDayName(dateStr: string): string {
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  const d = new Date(dateStr)
  return days[d.getDay()]
}

/**
 * Turkish short month names.
 */
export function formatTurkishDate(dateStr: string): string {
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const d = new Date(dateStr)
  return `${d.getDate()} ${months[d.getMonth()]}`
}
