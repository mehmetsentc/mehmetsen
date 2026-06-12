'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, RefreshCw, Loader2, Navigation, AlertCircle, Cloud } from 'lucide-react'
import { WeatherCard } from './WeatherCard'
import { WeatherHourly } from './WeatherHourly'
import { WeatherForecast } from './WeatherForecast'
import { WeatherAlerts } from './WeatherAlerts'
import { PopularCities } from './PopularCities'
import type { WeatherData } from '@/types/weather'
import { cn } from '@/lib/utils'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'

// ── Fetch helper (client → /api/weather proxy) ─────────────────────────────
async function fetchWeatherClient(city: string, days = 7): Promise<WeatherData> {
  const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}&days=${days}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function WeatherSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-64 rounded-3xl bg-gradient-to-br from-sky-400/30 via-blue-400/20 to-indigo-400/30" />
      <div className="h-32 rounded-2xl bg-[rgb(var(--color-card))]" />
      <div className="h-48 rounded-2xl bg-[rgb(var(--color-card))]" />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export function WeatherClient() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [city, setCity] = usePageState<string | null>(PAGE_STATE_KEYS.weatherCity, null)
  const [locationDenied, setLocationDenied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = usePageState(PAGE_STATE_KEYS.weatherSearchOpen, false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const geoRequestedRef = useRef(false)

  // ── Load weather for a city ──────────────────────────────────────────
  const loadWeather = useCallback(async (cityName: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWeatherClient(cityName)
      setWeather(data)
      setCity(cityName)
      localStorage.setItem('weather_city', cityName)
    } catch {
      setError('Hava durumu alınamadı. Lütfen şehir adını kontrol edin.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Request geolocation ──────────────────────────────────────────────
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation || geoRequestedRef.current) return
    geoRequestedRef.current = true

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        // Reverse geocode via WeatherAPI (lat,lng query)
        await loadWeather(`${lat},${lng}`)
      },
      () => {
        setLocationDenied(true)
        // Try stored city
        const stored = localStorage.getItem('weather_city')
        if (stored) {
          void loadWeather(stored)
        }
      },
      { timeout: 8000 }
    )
  }, [loadWeather])

  // ── Mount: try stored city, then geo ────────────────────────────────
  useEffect(() => {
    if (weather) return
    const stored =
      city ??
      (typeof window !== 'undefined' ? localStorage.getItem('weather_city') : null)
    if (stored) {
      void loadWeather(stored)
      return
    }
    requestGeolocation()
  }, [city, weather, loadWeather, requestGeolocation])

  // ── Auto-refresh every 15 minutes ────────────────────────────────────
  useEffect(() => {
    if (!city) return
    refreshTimerRef.current = setInterval(() => {
      void loadWeather(city)
    }, 15 * 60 * 1000)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [city, loadWeather])

  // ── Focus search input ───────────────────────────────────────────────
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    void loadWeather(q)
    setSearchQuery('')
    setShowSearch(false)
  }, [searchQuery, loadWeather])

  const handleCitySelect = useCallback((selectedCity: string) => {
    void loadWeather(selectedCity)
    setShowSearch(false)
  }, [loadWeather])

  const todayHours = weather?.forecast?.[0]?.hour ?? []

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">
            🌤️ Hava Durumu
          </h1>
          {weather && (
            <p className="text-xs text-[rgb(var(--color-muted))]">
              Son güncelleme: {weather.current.last_updated.split(' ')[1]}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {weather && (
            <button
              type="button"
              onClick={() => city && void loadWeather(city)}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))] disabled:opacity-40"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSearch(v => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))]"
          >
            {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      {showSearch && (
        <div className="space-y-4">
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 focus-within:border-[rgb(var(--color-brand))]/60">
              <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Şehir ara… (İstanbul, Ankara, New York…)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
              />
              {searchQuery && (
                <button type="submit" className="rounded-full bg-[rgb(var(--color-brand))] px-3 py-1 text-xs font-bold text-white">
                  Ara
                </button>
              )}
            </div>
          </form>

          {/* Geolocation re-request */}
          {locationDenied && (
            <button
              type="button"
              onClick={() => { geoRequestedRef.current = false; requestGeolocation() }}
              className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-brand))]"
            >
              <Navigation className="h-4 w-4" />
              Konumumu kullan
            </button>
          )}

          <PopularCities onSelect={handleCitySelect} />
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !weather && <WeatherSkeleton />}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <div className="mt-4 space-y-3">
            <PopularCities onSelect={handleCitySelect} />
          </div>
        </div>
      )}

      {/* ── No city & no error & not loading ── */}
      {!weather && !loading && !error && !showSearch && (
        <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <Cloud className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Konum algılanıyor…</p>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Veya yukarıdan şehir arayın
          </p>
        </div>
      )}

      {/* ── Weather data ── */}
      {weather && !error && (
        <>
          {/* Alerts — shown prominently at top */}
          {weather.alerts.length > 0 && (
            <WeatherAlerts alerts={weather.alerts} />
          )}

          {/* Main card */}
          <WeatherCard data={weather} />

          {/* Hourly */}
          {todayHours.length > 0 && <WeatherHourly hours={todayHours} />}

          {/* Forecast */}
          {weather.forecast.length > 0 && <WeatherForecast forecast={weather.forecast} />}

          {/* Popular cities to explore */}
          {!showSearch && (
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
              <PopularCities onSelect={handleCitySelect} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
