'use client'

import { conditionEmoji, turkishDayName, formatTurkishDate } from '@/lib/weatherApi'
import type { ForecastDay } from '@/types/weather'
import { cn } from '@/lib/utils'

interface WeatherForecastProps {
  forecast: ForecastDay[]
}

export function WeatherForecast({ forecast }: WeatherForecastProps) {
  if (!forecast.length) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
        <h3 className="text-sm font-black text-[rgb(var(--color-text))]">
          {forecast.length}-Günlük Tahmin
        </h3>
      </div>

      <div className="divide-y divide-[rgb(var(--color-border))]">
        {forecast.map((day, i) => {
          const emoji = conditionEmoji(day.day.condition.code, 1)
          const dayName = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : turkishDayName(day.date)
          const dateStr = formatTurkishDate(day.date)
          const rainChance = day.day.daily_chance_of_rain
          const snowChance = day.day.daily_chance_of_snow

          // Width of temp range bar (normalize to 0-100 scale)
          const allMaxes = forecast.map(d => d.day.maxtemp_c)
          const allMins = forecast.map(d => d.day.mintemp_c)
          const absMax = Math.max(...allMaxes)
          const absMin = Math.min(...allMins)
          const range = absMax - absMin || 1
          const barStart = ((day.day.mintemp_c - absMin) / range) * 100
          const barWidth = ((day.day.maxtemp_c - day.day.mintemp_c) / range) * 100

          return (
            <div key={day.date} className="flex items-center gap-3 px-4 py-3">
              {/* Day */}
              <div className="w-16 shrink-0">
                <p className="text-sm font-bold text-[rgb(var(--color-text))]">{dayName}</p>
                <p className="text-[11px] text-[rgb(var(--color-muted))]">{dateStr}</p>
              </div>

              {/* Emoji */}
              <span className="text-2xl">{emoji}</span>

              {/* Precipitation */}
              <div className="w-10 shrink-0 text-center">
                {(rainChance > 20 || snowChance > 20) && (
                  <span className="text-[11px] font-medium text-sky-500">
                    %{Math.max(rainChance, snowChance)}
                  </span>
                )}
              </div>

              {/* Temp range bar */}
              <div className="flex flex-1 items-center gap-2">
                <span className="w-8 text-right text-xs font-semibold text-[rgb(var(--color-muted))]">
                  {Math.round(day.day.mintemp_c)}°
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--color-border))]">
                  <div
                    className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 via-yellow-400 to-orange-500"
                    style={{ left: `${barStart}%`, width: `${Math.max(barWidth, 8)}%` }}
                  />
                </div>
                <span className="w-8 text-xs font-bold text-[rgb(var(--color-text))]">
                  {Math.round(day.day.maxtemp_c)}°
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
