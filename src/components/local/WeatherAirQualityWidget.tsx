'use client'

import { useEffect, useState } from 'react'
import { Wind, Droplets, Thermometer, Eye, RefreshCw } from 'lucide-react'

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
  co: number
}

// WMO weather code → Turkish label + emoji
function wmoLabel(code: number): { label: string; emoji: string } {
  if (code === 0)              return { label: 'Açık',            emoji: '☀️' }
  if (code <= 3)               return { label: 'Parçalı Bulutlu', emoji: '⛅' }
  if (code <= 48)              return { label: 'Sisli',           emoji: '🌫️' }
  if (code <= 57)              return { label: 'Çiseleyen',       emoji: '🌦️' }
  if (code <= 67)              return { label: 'Yağmurlu',        emoji: '🌧️' }
  if (code <= 77)              return { label: 'Karlı',           emoji: '❄️' }
  if (code <= 82)              return { label: 'Sağanak',         emoji: '🌧️' }
  if (code <= 94)              return { label: 'Dolu',            emoji: '🌨️' }
  return                              { label: 'Fırtınalı',       emoji: '⛈️' }
}

// European AQI → level + color class
function aqiLevel(aqi: number): { label: string; colorClass: string; bgClass: string } {
  if (aqi <= 20)  return { label: 'İyi',        colorClass: 'text-green-500',  bgClass: 'bg-green-500/10'  }
  if (aqi <= 40)  return { label: 'Makul',      colorClass: 'text-lime-500',   bgClass: 'bg-lime-500/10'   }
  if (aqi <= 60)  return { label: 'Orta',       colorClass: 'text-yellow-500', bgClass: 'bg-yellow-500/10' }
  if (aqi <= 80)  return { label: 'Kötü',       colorClass: 'text-orange-500', bgClass: 'bg-orange-500/10' }
  if (aqi <= 100) return { label: 'Çok Kötü',   colorClass: 'text-red-500',    bgClass: 'bg-red-500/10'    }
  return                 { label: 'Tehlikeli',   colorClass: 'text-purple-600', bgClass: 'bg-purple-600/10' }
}

function aqiBar(aqi: number) {
  const pct = Math.min((aqi / 100) * 100, 100)
  const level = aqiLevel(aqi)
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[rgb(var(--color-border))]">
      <div
        className={`h-full rounded-full ${level.colorClass.replace('text-', 'bg-')}`}
        style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
      />
    </div>
  )
}

export function WeatherAirQualityWidget({ lat, lng, cityName }: Props) {
  const [weather, setWeather]   = useState<WeatherData | null>(null)
  const [aqi,     setAqi]       = useState<AqiData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(false)

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
        temperature:   c.temperature_2m,
        apparentTemp:  c.apparent_temperature,
        humidity:      c.relative_humidity_2m,
        windSpeed:     c.wind_speed_10m,
        weatherCode:   c.weather_code,
        precipitation: c.precipitation,
      })

      const a = aJson.current
      setAqi({
        europeanAqi: a.european_aqi,
        pm10:        a.pm10,
        pm25:        a.pm2_5,
        no2:         a.nitrogen_dioxide,
        o3:          a.ozone,
        co:          a.carbon_monoxide,
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

  if (loading) return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 animate-pulse">
      <div className="h-4 w-32 rounded-full bg-[rgb(var(--color-border))]" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[rgb(var(--color-border))]" />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 flex items-center justify-between">
      <span className="text-xs text-[rgb(var(--color-muted))]">Hava durumu yüklenemedi</span>
      <button
        onClick={() => void fetchData()}
        className="flex items-center gap-1 text-xs text-[rgb(var(--color-brand))] font-semibold"
      >
        <RefreshCw className="h-3 w-3" />
        Tekrar dene
      </button>
    </div>
  )

  if (!weather || !aqi) return null

  const { label: wLabel, emoji: wEmoji } = wmoLabel(weather.weatherCode)
  const aqiInfo = aqiLevel(aqi.europeanAqi)

  return (
    <div className="mx-3 mt-3 mb-1 space-y-2">

      {/* ── Hava Durumu Kartı ── */}
      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
        {/* Başlık satırı */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <Thermometer className="h-3.5 w-3.5 text-[rgb(var(--color-brand))]" />
            <span className="text-xs font-semibold text-[rgb(var(--color-muted))] uppercase tracking-wide">
              Hava Durumu · {cityName}
            </span>
          </div>
          <button
            onClick={() => void fetchData()}
            className="text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))] transition-colors"
            aria-label="Yenile"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Ana sıcaklık */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <span className="text-4xl">{wEmoji}</span>
          <div>
            <div className="flex items-end gap-1.5">
              <span className="text-3xl font-bold text-[rgb(var(--color-text))]">
                {Math.round(weather.temperature)}°
              </span>
              <span className="mb-1 text-sm text-[rgb(var(--color-muted))]">C</span>
            </div>
            <p className="text-xs text-[rgb(var(--color-muted))]">
              {wLabel} · Hissedilen {Math.round(weather.apparentTemp)}°C
            </p>
          </div>
        </div>

        {/* Detay grid */}
        <div className="grid grid-cols-3 border-t border-[rgb(var(--color-border))]">
          <div className="flex flex-col items-center py-2.5 border-r border-[rgb(var(--color-border))]">
            <Droplets className="h-4 w-4 text-blue-400 mb-1" />
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{weather.humidity}%</span>
            <span className="text-[10px] text-[rgb(var(--color-muted))]">Nem</span>
          </div>
          <div className="flex flex-col items-center py-2.5 border-r border-[rgb(var(--color-border))]">
            <Wind className="h-4 w-4 text-sky-400 mb-1" />
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{Math.round(weather.windSpeed)}</span>
            <span className="text-[10px] text-[rgb(var(--color-muted))]">km/s Rüzgar</span>
          </div>
          <div className="flex flex-col items-center py-2.5">
            <Eye className="h-4 w-4 text-indigo-400 mb-1" />
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{weather.precipitation} mm</span>
            <span className="text-[10px] text-[rgb(var(--color-muted))]">Yağış</span>
          </div>
        </div>
      </div>

      {/* ── Hava Kalitesi Kartı ── */}
      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
        {/* Başlık + genel AQI */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-xs font-semibold text-[rgb(var(--color-muted))] uppercase tracking-wide">
            Hava Kalitesi (AQI)
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${aqiInfo.colorClass} ${aqiInfo.bgClass}`}>
            {aqiInfo.label} · {Math.round(aqi.europeanAqi)}
          </span>
        </div>

        {/* AQI bar */}
        <div className="px-4 pb-3">
          {aqiBar(aqi.europeanAqi)}
          <div className="mt-1 flex justify-between text-[9px] text-[rgb(var(--color-muted))]">
            <span>İyi</span>
            <span>Orta</span>
            <span>Tehlikeli</span>
          </div>
        </div>

        {/* Kirletici grid */}
        <div className="grid grid-cols-2 gap-px border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-border))]">
          {[
            { label: 'PM2.5',  value: aqi.pm25,  unit: 'μg/m³', limit: 25  },
            { label: 'PM10',   value: aqi.pm10,  unit: 'μg/m³', limit: 50  },
            { label: 'NO₂',    value: aqi.no2,   unit: 'μg/m³', limit: 40  },
            { label: 'O₃',     value: aqi.o3,    unit: 'μg/m³', limit: 120 },
          ].map(({ label, value, unit, limit }) => {
            const ratio = Math.min(value / limit, 1)
            const color = ratio < 0.5 ? 'bg-green-500' : ratio < 0.85 ? 'bg-yellow-500' : 'bg-red-500'
            return (
              <div key={label} className="bg-[rgb(var(--color-card))] px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[rgb(var(--color-text))]">{label}</span>
                  <span className="text-xs text-[rgb(var(--color-muted))]">
                    {Math.round(value * 10) / 10} <span className="text-[9px]">{unit}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-[rgb(var(--color-border))]">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${ratio * 100}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        <p className="px-4 py-2 text-[10px] text-[rgb(var(--color-muted))] text-center">
          Kaynak: Open-Meteo · Avrupa AQI standardı
        </p>
      </div>
    </div>
  )
}
