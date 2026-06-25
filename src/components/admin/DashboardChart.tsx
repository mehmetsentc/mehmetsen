'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { PublishSeriesPoint } from '@/services/adminService'

interface DashboardChartProps {
  data: PublishSeriesPoint[]
  /** Yükseklik px */
  height?: number
}

/**
 * DashboardChart — F4
 *
 * Saf SVG area chart (recharts/chartjs gibi 3rd-party bundle eklemeden).
 * Last-7-days yayın volume görselleştirir, mock'taki "Ziyaretçi Grafiği"
 * alanını dolduruyor.
 */
export function DashboardChart({ data, height = 200 }: DashboardChartProps) {
  const { path, area, max, points, labels } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', area: '', max: 0, points: [] as Array<{ x: number; y: number; v: number; date: string }>, labels: [] as string[] }
    }

    const w = 100 // viewBox width % units
    const h = 100 // viewBox height
    const padding = 4
    const innerW = w - padding * 2
    const innerH = h - padding * 2

    const maxVal = Math.max(...data.map((d) => d.count), 5)
    const step = data.length > 1 ? innerW / (data.length - 1) : 0

    const pts = data.map((d, i) => {
      const x = padding + i * step
      const y = padding + innerH - (d.count / maxVal) * innerH
      return { x, y, v: d.count, date: d.date }
    })

    // Smooth path with quadratic curves
    const linePath = pts
      .map((p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`
        const prev = pts[i - 1]
        const cx = (prev.x + p.x) / 2
        return `Q ${prev.x} ${prev.y} ${cx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`
      })
      .join(' ')

    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${h - padding} L ${pts[0].x} ${h - padding} Z`

    const labels = data.map((d) => format(new Date(d.date), 'EE', { locale: tr }))

    return {
      path: linePath,
      area: areaPath,
      max: maxVal,
      points: pts,
      labels,
    }
  }, [data])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-bg-subtle text-sm text-text-tertiary"
        style={{ height }}
      >
        Henüz veri yok
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-label="Son 7 gün yayın grafiği"
      >
        <defs>
          <linearGradient id="dashboard-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="4"
            x2="96"
            y1={4 + (100 - 8) * t}
            y2={4 + (100 - 8) * t}
            stroke="rgb(var(--border-subtle))"
            strokeWidth="0.3"
            strokeDasharray="0.8 0.8"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Area fill */}
        <path d={area} fill="url(#dashboard-chart-fill)" />

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke="rgb(var(--brand-500))"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: 'drop-shadow(0 1px 1px rgb(var(--brand-500) / 0.4))' }}
        />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="0.9"
              fill="rgb(var(--bg-card))"
              stroke="rgb(var(--brand-500))"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <title>{`${format(new Date(p.date), 'd MMMM', { locale: tr })}: ${p.v} haber`}</title>
          </g>
        ))}
      </svg>

      {/* X axis labels */}
      <div className="absolute inset-x-0 bottom-0 flex justify-between px-2 pt-2 text-2xs font-medium text-text-tertiary">
        {labels.map((l, i) => (
          <span key={i} className="capitalize">
            {l}
          </span>
        ))}
      </div>

      {/* Y axis max label */}
      <div className="absolute right-2 top-0 text-2xs font-semibold text-text-muted">
        Max: {max}
      </div>
    </div>
  )
}
