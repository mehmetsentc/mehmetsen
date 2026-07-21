'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCityCategoryName } from '@/constants/cities'
import { useUserLocation } from '@/hooks/useUserLocation'
import { buildWeatherQuery } from '@/lib/weatherQuery'
import { conditionEmoji, getEffectiveIsDay } from '@/lib/weatherApi'
import type { StoredUserLocation } from '@/lib/userLocationStorage'
import type { WeatherData } from '@/types/weather'

const POPULAR_CITY_SLUGS = ['istanbul', 'ankara', 'izmir', 'antalya', 'bursa'] as const

export function WeatherMini() {
  const userLocation = useUserLocation()
  const [manualSlug, setManualSlug] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const activeSlug = manualSlug ?? userLocation.citySlug
  const activeCoords = manualSlug ? null : userLocation.coords

  const loadWeather = useCallback(async (slug: string, coords: { lat: number; lng: number } | null) => {
    const query = buildWeatherQuery(slug, coords)
    try {
      const res = await fetch(
        `/api/weather?city=${encodeURIComponent(query)}&days=1&_=${Date.now()}`,
        { cache: 'no-store', headers: { Pragma: 'no-cache' } }
      )
      if (!res.ok) return
      const data = (await res.json()) as WeatherData
      setWeather(data)
      setNowMs(Date.now())
    } catch {
      // keep skeleton on failure
    }
  }, [])

  useEffect(() => {
    if (!userLocation.ready && !manualSlug) return
    void loadWeather(activeSlug, activeCoords)
  }, [activeSlug, activeCoords, userLocation.ready, manualSlug, loadWeather])

  // Keep the widget fresh: refresh every 5 min and when the tab regains focus,
  // so it never lingers on old data (e.g. showing last night's weather).
  useEffect(() => {
    if (!userLocation.ready && !manualSlug) return
    const REFRESH_MS = 2 * 60 * 1000
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadWeather(activeSlug, activeCoords)
    }
    const id = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [activeSlug, activeCoords, userLocation.ready, manualSlug, loadWeather])

  // Tick every minute so day/night emoji flips even if the payload is CDN-stale.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

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
  const isDay = getEffectiveIsDay(weather, nowMs)
  const emoji = conditionEmoji(cur.condition.code, isDay, cur.condition.icon)
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
