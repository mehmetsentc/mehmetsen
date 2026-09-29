'use client'

import { progressAmountLabel } from '@/media-studio/format'

/** Mock progress readout. Percentages come from local fixtures, not a worker. */
export function DownloadMeter({
  label,
  percent,
  amount,
  stats,
}: {
  label: string
  percent: number
  amount?: string
  stats?: { label: string; value: number }[]
}) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <section className="rounded-2xl bg-[rgb(var(--color-card))] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[rgb(var(--color-border))]">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">{label}</h2>
        <p className="text-[32px] font-semibold leading-none tabular-nums tracking-tight text-[rgb(var(--color-text))]">{width}%</p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-[rgb(var(--color-surface))]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-label={label}
      >
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: 'rgb(var(--admin-info))' }} />
      </div>
      {amount ? <p className="mt-3 text-sm font-medium text-[rgb(var(--color-text))]">{amount}</p> : null}
      {stats && stats.length > 0 ? (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[rgb(var(--color-border))] pt-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-[rgb(var(--color-muted))]">{stat.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-[rgb(var(--color-text))]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

export function amountLabel(loaded: string, total: string): string {
  return progressAmountLabel(loaded, total)
}
