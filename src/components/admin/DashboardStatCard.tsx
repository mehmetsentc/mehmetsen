'use client'

import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface DashboardStatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  /** Yüzdesel değişim, null = gizli */
  delta?: number | null
  /** Pozitif delta'nın "iyi" mi "kötü" mü olduğu (örn: bekleyen rapor için artış kötüdür) */
  invertColor?: boolean
  /** Renk teması — mock'taki accent renklerine karşılık */
  accent?: 'brand' | 'ekonomi' | 'siyaset' | 'spor' | 'teknoloji' | 'saglik' | 'magazin'
  description?: string
  loading?: boolean
}

const ACCENT_FG: Record<NonNullable<DashboardStatCardProps['accent']>, string> = {
  brand:     'text-brand-600 dark:text-brand-300',
  ekonomi:   'text-cat-ekonomi',
  siyaset:   'text-cat-siyaset',
  spor:      'text-cat-spor',
  teknoloji: 'text-cat-teknoloji',
  saglik:    'text-cat-saglik',
  magazin:   'text-cat-magazin',
}

const ACCENT_BG: Record<NonNullable<DashboardStatCardProps['accent']>, string> = {
  brand:     'bg-brand-500/10',
  ekonomi:   'bg-cat-ekonomi/10',
  siyaset:   'bg-cat-siyaset/10',
  spor:      'bg-cat-spor/10',
  teknoloji: 'bg-cat-teknoloji/10',
  saglik:    'bg-cat-saglik/10',
  magazin:   'bg-cat-magazin/10',
}

/**
 * DashboardStatCard — F4
 *
 * Mock'taki stat kartlarına eş — büyük rakam + delta yüzdesi + ikon.
 * Delta'yı renkli + ikonlu küçük rozette gösterir.
 */
export function DashboardStatCard({
  label,
  value,
  icon: Icon,
  delta = null,
  invertColor = false,
  accent = 'brand',
  description,
  loading = false,
}: DashboardStatCardProps) {
  const positive = delta !== null && delta > 0
  const negative = delta !== null && delta < 0
  const goodSign = invertColor ? negative : positive

  return (
    <Card surface="elevated" radius="2xl" hover="lift" className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {label}
          </p>
          <p className="mt-1.5 text-3xl font-black tracking-tight text-text-primary tabular-nums">
            {loading ? <span className="animate-pulse text-text-muted">…</span> : formatNumber(value)}
          </p>
          {description ? (
            <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
          ) : null}
        </div>
        <span
          className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', ACCENT_BG[accent], ACCENT_FG[accent])}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>

      {delta !== null ? (
        <div className="mt-3 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
              goodSign
                ? 'bg-success/10 text-success'
                : delta === 0
                  ? 'bg-bg-subtle text-text-tertiary'
                  : 'bg-danger/10 text-danger'
            )}
          >
            {positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : negative ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-2xs text-text-tertiary">son 7 gün</span>
        </div>
      ) : null}
    </Card>
  )
}

function formatNumber(v: string | number): string {
  if (typeof v === 'string') return v
  return v.toLocaleString('tr-TR')
}
