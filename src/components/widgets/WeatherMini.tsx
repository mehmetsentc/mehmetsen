'use client'

import { useEffect, useState } from 'react'
import type { WeatherData } from '@/types/weather'

function weatherEmoji(code: number, isDay: number): string {
  if (code === 1000) return isDay ? '☀️' : '🌙'
  if (code <= 1009) return '⛅'
  if (code <= 1030) return '🌤️'
  if ([1063, 1180, 1183].includes(code)) return '🌦️'
  if (code <= 1201) return '🌧️'
  if (code <= 1237) return '❄️'
  if ([1273, 1276, 1087].includes(code)) return '⛈️'
  return '🌡️'
}

export function WeatherMini() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [city, setCity] = useState('Istanbul')

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {}
      )
    }
    fetch(`/api/weather?city=${encodeURIComponent(city)}&days=1`)
      .then((r) => r.json())
      .then((d: WeatherData) => setWeather(d))
      .catch(() => {})
  }, [city])

  if (!weather) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl bg-[rgb(var(--color-surface))] p-3 animate-pulse min-h-[80px]" />
    )
  }

  const cur = weather.current
  const loc = weather.location
  const emoji = weatherEmoji(cur.condition.code, cur.is_day)
  const cities = ['Istanbul', 'Ankara', 'Izmir', 'Antalya', 'Bursa']

  return (
    <div className="flex h-full flex-col rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 p-3 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-100">
            Hava Durumu
          </p>
          <select
            className="mt-0.5 bg-transparent text-[12px] font-bold text-white appearance-none cursor-pointer outline-none"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c} value={c} className="text-black">
                {c === 'Istanbul' ? 'İstanbul' : c}
              </option>
            ))}
          </select>
        </div>
        <span className="text-3xl leading-none">{emoji}</span>
      </div>
      <div className="mt-auto">
        <p className="text-[24px] font-black leading-none">{Math.round(cur.temp_c)}°</p>
        <p className="text-[10px] text-blue-100 truncate">{cur.condition.text}</p>
      </div>
    </div>
  )
}
