'use client'

import { useEffect, useState } from 'react'
import { Wind, Droplets, RefreshCw } from 'lucide-react'

interface Props {
  lat: number
  lng: number
  cityName: string
}

interface WeatherData {
  temperature: number
  apparentTemp: number
  humidity: number
  windSpeed: number
  weatherCode: number
  precipitation: number
}

interface AqiData {
  europeanAqi: number
  pm10: number
  pm25: number
  no2: number
  o3: number
}

function wmoLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: 'Açık', emoji: '☀️' }
  if (code <= 3) return { label: 'Parçalı bulutlu', emoji: '⛅' }
  if (code <= 48) return { label: 'Sisli', emoji: '🌫️' }
  if (code <= 57) return { label: 'Çiseleyen', emoji: '🌦️' }
  if (code <= 67) return { label: 'Yağmurlu', emoji: '🌧️' }
  if (code <= 77) return { label: 'Karlı', emoji: '❄️' }
  if (code <= 82) return { label: 'Sağanak', emoji: '🌧️' }
  if (code <= 94) return { label: 'Dolu', emoji: '🌨️' }
  return { label: 'Fırtınalı', emoji: '⛈️' }
}

function aqiLevel(aqi: number): { label: string; colorClass: string; bgClass: string } {
  if (aqi <= 20) return { label: 'İyi', colorClass: 'text-green-600', bgClass: 'bg-green-500/15' }
  if (aqi <= 40) return { label: 'Makul', colorClass: 'text-lime-700', bgClass: 'bg-lime-500/15' }
  if (aqi <= 60) return { label: 'Orta', colorClass: 'text-yellow-700', bgClass: 'bg-yellow-500/15' }
  if (aqi <= 80) return { label: 'Kötü', colorClass: 'text-orange-700', bgClass: 'bg-orange-500/15' }
  if (aqi <= 100) return { label: 'Çok kötü', colorClass: 'text-red-700', bgClass: 'bg-red-500/15' }
  return { label: 'Tehlikeli', colorClass: 'text-purple-700', bgClass: 'bg-purple-600/15' }
}

export function WeatherAirQualityWidget({ lat, lng, cityName }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [aqi, setAqi] = useState<AqiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(false)
    try {
      const [wRes, aRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
            `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation` +
            `&timezone=Europe%2FIstanbul`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
            `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,european_aqi` +
            `&timezone=Europe%2FIstanbul`
        ),
      ])

      if (!wRes.ok || !aRes.ok) throw new Error('API error')

      const [wJson, aJson] = await Promise.all([wRes.json(), aRes.json()])
      const c = wJson.current
      setWeather({
        temperature: c.temperature_2m,
        apparentTemp: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        windSpeed: c.wind_speed_10m,
        weatherCode: c.weather_code,
        precipitation: c.precipitation,
      })
      const a = aJson.current
      setAqi({
        europeanAqi: a.european_aqi,
        pm10: a.pm10,
        pm25: a.pm2_5,
        no2: a.nitrogen_dioxide,
        o3: a.ozone,
      })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  if (loading) {
    return (
      <div className="local-wx animate-pulse" aria-hidden>
        <div className="local-wx__card h-14 flex-1" />
        <div className="local-wx__card h-14 flex-1" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="local-wx">
        <div className="local-wx__card justify-between">
          <span className="local-wx__meta">Hava durumu yüklenemedi</span>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-brand))]"
          >
            <RefreshCw className="h-3 w-3" />
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }

  if (!weather || !aqi) return null

  const { label: wLabel, emoji: wEmoji } = wmoLabel(weather.weatherCode)
  const aqiInfo = aqiLevel(aqi.europeanAqi)

  return (
    <div className="local-wx" aria-label={`${cityName} hava durumu`}>
      <div className="local-wx__card local-wx__card--weather">
        <span className="local-wx__emoji" aria-hidden>
          {wEmoji}
        </span>
        <div className="local-wx__main min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="local-wx__temp">{Math.round(weather.temperature)}°</span>
            <span className="local-wx__meta truncate">
              {wLabel} · {cityName}
            </span>
          </div>
          <p className="local-wx__meta">Hissedilen {Math.round(weather.apparentTemp)}°</p>
        </div>
        <div className="local-wx__stats">
          <span className="inline-flex items-center gap-1">
            <Droplets className="h-3 w-3 text-blue-500" />
            {weather.humidity}%
          </span>
          <span className="inline-flex items-center gap-1">
            <Wind className="h-3 w-3 text-sky-500" />
            {Math.round(weather.windSpeed)} km/s
          </span>
          <span>{weather.precipitation} mm</span>
        </div>
      </div>

      <div className="local-wx__card local-wx__card--aqi">
        <div className="local-wx__aqi-head">
          <p className="local-wx__meta">Hava kalitesi</p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="shrink-0 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]"
            aria-label="Hava durumunu yenile"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="local-wx__aqi-body">
          <span className={`local-wx__aqi ${aqiInfo.colorClass} ${aqiInfo.bgClass}`}>
            {aqiInfo.label} · {Math.round(aqi.europeanAqi)} AQI
          </span>
          <div className="local-wx__stats local-wx__stats--aqi">
            <span>PM2.5 {Math.round(aqi.pm25)}</span>
            <span>PM10 {Math.round(aqi.pm10)}</span>
            <span>O₃ {Math.round(aqi.o3)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
