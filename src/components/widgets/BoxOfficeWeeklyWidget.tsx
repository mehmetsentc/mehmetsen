'use client'

import { useEffect, useState } from 'react'
import { Clapperboard, ExternalLink, RefreshCw } from 'lucide-react'
import type { BoxOfficeWeeklyData } from '@/services/boxOfficeTurkiyeService'
import { BOX_OFFICE_BASE } from '@/services/boxOfficeTurkiyeService'
import { cn } from '@/lib/utils'

function FilmRow({
  rank,
  title,
  weekAudience,
  weekRevenue,
  filmUrl,
}: {
  rank: number
  title: string
  weekAudience: string
  weekRevenue: string
  filmUrl: string
}) {
  return (
    <tr className="border-b border-[rgb(var(--color-border))] last:border-0 hover:bg-[rgb(var(--color-surface))]/60 transition-colors">
      <td className="py-2 pl-3 pr-2 text-xs font-medium text-[rgb(var(--color-muted))] w-8">
        {rank}
      </td>
      <td className="py-2 pr-3">
        <a
          href={filmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))] line-clamp-2"
        >
          {title}
        </a>
      </td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-[rgb(var(--color-text-secondary))] hidden sm:table-cell">
        {weekAudience}
      </td>
      <td className="py-2 pr-3 text-right text-xs font-semibold tabular-nums text-[rgb(var(--color-text))]">
        {weekRevenue}
      </td>
    </tr>
  )
}

export function BoxOfficeWeeklyWidget({
  variant = 'default',
}: {
  variant?: 'default' | 'compact'
}) {
  const [data, setData] = useState<BoxOfficeWeeklyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/boxoffice/weekly', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 404) {
          setData(null)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = (await res.json()) as BoxOfficeWeeklyData
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!loading && !data && !error) return null

  const weekLabel = data
    ? `${data.year} · ${data.week}. hafta`
    : loading
      ? 'Yükleniyor…'
      : ''

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm',
        variant === 'compact' ? 'mb-0' : 'mb-5'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-brand))]/10">
            <Clapperboard className="h-4 w-4 text-[rgb(var(--color-brand))]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
              Haftalık Gişe
            </h2>
            <p className="text-[11px] text-[rgb(var(--color-text-secondary))]">
              Türkiye sinema hasılatı · {weekLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] disabled:opacity-50"
            aria-label="Yenile"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {variant !== 'compact' && (
            <a
              href={data?.detailUrl ?? `${BOX_OFFICE_BASE}/hafta/yillar`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Box Office Türkiye
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {error ? (
        <p className="px-4 py-6 text-sm text-red-500">{error}</p>
      ) : loading && !data ? (
        <div className="space-y-2 px-4 py-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
          ))}
        </div>
      ) : data ? (
        <>
          {variant !== 'compact' && (
            <div className="grid grid-cols-3 gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  Seyirci
                </p>
                <p className="mt-0.5 text-sm font-bold text-[rgb(var(--color-text))]">
                  {data.totalAudience}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  Hasılat
                </p>
                <p className="mt-0.5 text-sm font-bold text-[rgb(var(--color-text))]">
                  {data.totalRevenue}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  Film
                </p>
                <p className="mt-0.5 text-sm font-bold text-[rgb(var(--color-text))]">
                  {data.filmCount}
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px]">
              <thead>
                <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/50 text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  <th className="w-8 py-2 pl-3 pr-2 text-left font-semibold">#</th>
                  <th className="py-2 pr-3 text-left font-semibold">Film</th>
                  {variant !== 'compact' && (
                    <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">
                      Seyirci
                    </th>
                  )}
                  <th className="py-2 pr-3 text-right font-semibold">Hasılat</th>
                </tr>
              </thead>
              <tbody>
                {data.films.slice(0, variant === 'compact' ? 5 : 8).map((film) => (
                  <FilmRow
                    key={`${film.rank}-${film.title}`}
                    rank={film.rank}
                    title={film.title}
                    weekAudience={film.weekAudience}
                    weekRevenue={film.weekRevenue}
                    filmUrl={film.filmUrl}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {variant === 'compact' && (
            <div className="border-t border-[rgb(var(--color-border))] px-4 py-2.5">
              <a
                href={data.detailUrl ?? `${BOX_OFFICE_BASE}/hafta/yillar`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
              >
                Tüm gişe verileri
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
