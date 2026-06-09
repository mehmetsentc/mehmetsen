import type { WeatherApiResponse, WeatherData } from '@/types/weather'

const BASE_URL = 'https://api.weatherapi.com/v1'

function getApiKey(): string {
  const key = process.env.WEATHER_API_KEY
  if (!key) throw new Error('WEATHER_API_KEY is not set')
  return key
}

/**
 * Fetch current weather + n-day forecast + alerts for a city.
 * Server-side only (uses WEATHER_API_KEY).
 */
export async function fetchWeather(city: string, days = 7): Promise<WeatherData> {
  const key = getApiKey()
  const url = `${BASE_URL}/forecast.json?key=${key}&q=${encodeURIComponent(city)}&days=${days}&aqi=no&alerts=yes&lang=tr`

  const res = await fetch(url, { next: { revalidate: 900 } }) // 15-min ISR
  if (!res.ok) {
    throw new Error(`WeatherAPI error ${res.status}: ${await res.text()}`)
  }

  const data: WeatherApiResponse = await res.json()

  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast?.forecastday ?? [],
    alerts: data.alerts?.alert ?? [],
    fetchedAt: Date.now(),
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
