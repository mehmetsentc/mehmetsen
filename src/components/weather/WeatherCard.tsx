'use client'

import Image from 'next/image'
import { Droplets, Wind, Eye, Thermometer, Sun, Sunset, Gauge, UmbrellaOff } from 'lucide-react'
import { conditionEmoji, turkishDayName } from '@/lib/weatherApi'
import type { WeatherData } from '@/types/weather'

interface WeatherCardProps {
  data: WeatherData
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-sm">
      <span className="text-white/70">{icon}</span>
      <span className="text-xs font-bold text-white">{value}</span>
      <span className="text-[10px] text-white/60">{label}</span>
    </div>
  )
}

export function WeatherCard({ data }: WeatherCardProps) {
  const { location, current, forecast } = data
  const today = forecast[0]
  const emoji = conditionEmoji(current.condition.code, current.is_day)

  // Background gradient based on time/condition
  const isNight = !current.is_day
  const isRain = [1180, 1183, 1186, 1189, 1192, 1195, 1063, 1150, 1153].includes(current.condition.code)
  const isStorm = [1087, 1273, 1276].includes(current.condition.code)
  const isSnow = current.condition.code >= 1210 && current.condition.code <= 1264
  const isCloud = current.condition.code >= 1003 && current.condition.code <= 1030

  const gradient = isStorm
    ? 'from-slate-800 via-slate-700 to-slate-600'
    : isSnow
    ? 'from-sky-300 via-sky-200 to-white'
    : isRain
    ? 'from-slate-600 via-sky-700 to-sky-600'
    : isNight
    ? 'from-slate-900 via-indigo-900 to-violet-900'
    : isCloud
    ? 'from-slate-500 via-sky-500 to-sky-400'
    : 'from-sky-400 via-blue-500 to-indigo-500'

  const textColor = isSnow ? 'text-sky-900' : 'text-white'

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-6 shadow-2xl`}
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

      {/* Location */}
      <div className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${textColor} opacity-80`}>
        <span>📍</span>
        <span>{location.name}</span>
        {location.region && location.region !== location.name && (
          <span className="opacity-60">· {location.region}</span>
        )}
      </div>

      {/* Main temp row */}
      <div className={`flex items-start justify-between ${textColor}`}>
        <div>
          <div className="text-[5.5rem] font-black leading-none tracking-tight">
            {Math.round(current.temp_c)}°
          </div>
          <div className="mt-1 text-base font-medium opacity-80">{current.condition.text}</div>
          <div className="mt-0.5 text-sm opacity-60">
            Hissedilen {Math.round(current.feelslike_c)}° · Nem %{current.humidity}
          </div>
          {today && (
            <div className="mt-1 text-sm opacity-70">
              ↑{Math.round(today.day.maxtemp_c)}° ↓{Math.round(today.day.mintemp_c)}°
            </div>
          )}
        </div>

        <div className="text-7xl">{emoji}</div>
      </div>

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-4">
        <StatPill
          icon={<Droplets className="h-4 w-4" />}
          label="Nem"
          value={`%${current.humidity}`}
        />
        <StatPill
          icon={<Wind className="h-4 w-4" />}
          label="Rüzgar"
          value={`${Math.round(current.wind_kph)} km/s`}
        />
        <StatPill
          icon={<Eye className="h-4 w-4" />}
          label="Görüş"
          value={`${current.vis_km} km`}
        />
        <StatPill
          icon={<Gauge className="h-4 w-4" />}
          label="Basınç"
          value={`${current.pressure_mb}`}
        />
      </div>

      {/* Sunrise / Sunset */}
      {today?.astro && (
        <div className={`mt-4 flex items-center justify-center gap-8 border-t border-white/20 pt-4 text-sm ${textColor} opacity-80`}>
          <div className="flex items-center gap-1.5">
            <Sun className="h-4 w-4" />
            <span>{today.astro.sunrise}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sunset className="h-4 w-4" />
            <span>{today.astro.sunset}</span>
          </div>
        </div>
      )}
    </div>
  )
}
