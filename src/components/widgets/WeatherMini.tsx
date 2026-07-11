'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCityCategoryName } from '@/constants/cities'
import { useUserLocation } from '@/hooks/useUserLocation'
import { buildWeatherQuery } from '@/lib/weatherQuery'
import type { StoredUserLocation } from '@/lib/userLocationStorage'
import type { WeatherData } from '@/types/weather'

const POPULAR_CITY_SLUGS = ['istanbul', 'ankara', 'izmir', 'antalya', 'bursa'] as const

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
  const userLocation = useUserLocation()
  const [manualSlug, setManualSlug] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)

  const activeSlug = manualSlug ?? userLocation.citySlug
  const activeCoords = manualSlug ? null : userLocation.coords

  const loadWeather = useCallback(async (slug: string, coords: { lat: number; lng: number } | null) => {
    const query = buildWeatherQuery(slug, coords)
    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(query)}&days=1`)
      if (!res.ok) return
      const data = (await res.json()) as WeatherData
      setWeather(data)
    } catch {
      // keep skeleton on failure
    }
  }, [])

  useEffect(() => {
    if (!userLocation.ready && !manualSlug) return
    void loadWeather(activeSlug, activeCoords)
  }, [activeSlug, activeCoords, userLocation.ready, manualSlug, loadWeather])

  useEffect(() => {
    const onLocationUpdated = (event: Event) => {
      if (manualSlug) return
      const detail = (event as CustomEvent<StoredUserLocation>).detail
      if (!detail?.citySlug) return
      void loadWeather(
        detail.citySlug,
        detail.lat != null && detail.lng != null ? { lat: detail.lat, lng: detail.lng } : null
      )
    }

    window.addEventListener('nahaber:location-updated', onLocationUpdated)
    return () => window.removeEventListener('nahaber:location-updated', onLocationUpdated)
  }, [manualSlug, loadWeather])

  if (!weather) {
    return (
      <div className="flex h-full min-h-[80px] animate-pulse flex-col items-center justify-center rounded-xl bg-[rgb(var(--color-surface))] p-3" />
    )
  }

  const cur = weather.current
  const emoji = weatherEmoji(cur.condition.code, cur.is_day)
  const cityOptions = [...new Set([activeSlug, ...POPULAR_CITY_SLUGS])]

  return (
    <div className="flex h-full flex-col rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 p-3 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-100">
            Hava Durumu
          </p>
          <select
            className="mt-0.5 cursor-pointer appearance-none bg-transparent text-[12px] font-bold text-white outline-none"
            value={activeSlug}
            onChange={(e) => setManualSlug(e.target.value)}
          >
            {cityOptions.map((slug) => (
              <option key={slug} value={slug} className="text-black">
                {getCityCategoryName(slug)}
              </option>
            ))}
          </select>
        </div>
        <span className="text-3xl leading-none">{emoji}</span>
      </div>
      <div className="mt-auto">
        <p className="text-[24px] font-black leading-none">{Math.round(cur.temp_c)}°</p>
        <p className="truncate text-[10px] text-blue-100">{cur.condition.text}</p>
      </div>
    </div>
  )
}
