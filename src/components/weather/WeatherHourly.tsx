'use client'

import { conditionEmoji } from '@/lib/weatherApi'
import type { HourForecast } from '@/types/weather'

interface WeatherHourlyProps {
  hours: HourForecast[]
}

export function WeatherHourly({ hours }: WeatherHourlyProps) {
  // Show next 24h from current time
  const now = new Date()
  const upcoming = hours
    .filter(h => new Date(h.time) >= now)
    .slice(0, 12)

  if (upcoming.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
        <h3 className="text-sm font-black text-[rgb(var(--color-text))]">Saatlik Tahmin</h3>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 py-3 scrollbar-none">
        {upcoming.map((h) => {
          const time = new Date(h.time)
          const hourStr = time.getHours().toString().padStart(2, '0') + ':00'
          const emoji = conditionEmoji(h.condition.code, h.is_day)
          return (
            <div
              key={h.time}
              className="flex shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-3 transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              <span className="text-[11px] font-medium text-[rgb(var(--color-muted))]">{hourStr}</span>
              <span className="text-2xl">{emoji}</span>
              <span className="text-sm font-bold text-[rgb(var(--color-text))]">
                {Math.round(h.temp_c)}°
              </span>
              {h.chance_of_rain > 20 && (
                <span className="text-[10px] text-sky-500">%{h.chance_of_rain}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
