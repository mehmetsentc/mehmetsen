'use client'

import { AlertTriangle, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { WeatherAlert } from '@/types/weather'
import { cn } from '@/lib/utils'

interface WeatherAlertsProps {
  alerts: WeatherAlert[]
}

function AlertItem({ alert }: { alert: WeatherAlert }) {
  const [expanded, setExpanded] = useState(false)

  const severityColor = alert.severity === 'Extreme' || alert.severity === 'Severe'
    ? 'border-red-500/40 bg-red-500/5'
    : 'border-amber-500/40 bg-amber-500/5'

  const iconColor = alert.severity === 'Extreme' || alert.severity === 'Severe'
    ? 'text-red-500'
    : 'text-amber-500'

  return (
    <div className={cn('overflow-hidden rounded-2xl border', severityColor)}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[rgb(var(--color-text))]">{alert.event}</p>
          <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">{alert.areas}</p>
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-muted))] transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-[rgb(var(--color-border))] px-4 py-3 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
          {alert.desc || alert.headline}
          {alert.instruction && (
            <p className="mt-2 font-semibold text-[rgb(var(--color-text))]">
              {alert.instruction}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function WeatherAlerts({ alerts }: WeatherAlertsProps) {
  if (!alerts.length) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <h3 className="text-sm font-black text-[rgb(var(--color-text))]">
          🔴 Hava Uyarısı ({alerts.length})
        </h3>
      </div>
      {alerts.map((a, i) => (
        <AlertItem key={i} alert={a} />
      ))}
    </div>
  )
}
