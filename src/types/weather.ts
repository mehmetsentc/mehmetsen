// ── WeatherAPI response types ──────────────────────────────────────────────

export interface WeatherCondition {
  text: string
  icon: string
  code: number
}

export interface WeatherLocation {
  name: string
  region: string
  country: string
  lat: number
  lon: number
  localtime: string
  tz_id: string
}

export interface CurrentWeather {
  temp_c: number
  temp_f: number
  feelslike_c: number
  feelslike_f: number
  humidity: number
  wind_kph: number
  wind_dir: string
  pressure_mb: number
  vis_km: number
  uv: number
  is_day: number
  condition: WeatherCondition
  last_updated: string
}

export interface HourForecast {
  time: string
  temp_c: number
  feelslike_c: number
  humidity: number
  wind_kph: number
  chance_of_rain: number
  chance_of_snow: number
  condition: WeatherCondition
  is_day: number
}

export interface DayAstro {
  sunrise: string
  sunset: string
  moonrise: string
  moonset: string
  moon_phase: string
}

export interface DayForecast {
  maxtemp_c: number
  mintemp_c: number
  avgtemp_c: number
  maxwind_kph: number
  totalprecip_mm: number
  avghumidity: number
  daily_chance_of_rain: number
  daily_chance_of_snow: number
  condition: WeatherCondition
  uv: number
}

export interface ForecastDay {
  date: string
  day: DayForecast
  astro: DayAstro
  hour: HourForecast[]
}

export interface WeatherAlert {
  headline: string
  msgtype: string
  severity: string
  urgency: string
  areas: string
  category: string
  certainty: string
  event: string
  effective: string
  expires: string
  desc: string
  instruction: string
}

export interface WeatherApiResponse {
  location: WeatherLocation
  current: CurrentWeather
  forecast?: {
    forecastday: ForecastDay[]
  }
  alerts?: {
    alert: WeatherAlert[]
  }
}

// ── App-level weather state ────────────────────────────────────────────────

export interface WeatherData {
  location: WeatherLocation
  current: CurrentWeather
  forecast: ForecastDay[]
  alerts: WeatherAlert[]
  fetchedAt: number
}

// ── Firestore weather_news document ───────────────────────────────────────

export interface WeatherNewsDoc {
  id?: string
  city: string
  district: string
  country: string
  temperature: number
  humidity: number
  windKph: number
  condition: string
  conditionCode: number
  icon: string
  title: string
  summary: string
  content: string
  tags: string[]
  seoTitle: string
  seoDescription: string
  socialDescription: string
  isBreaking: boolean
  alertType: string | null
  publishedAt: Date | { toDate(): Date }
  createdAt: Date | { toDate(): Date }
}
