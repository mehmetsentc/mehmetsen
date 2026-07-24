'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, RefreshCw } from 'lucide-react'
import type { MatchResult, SportMatchKind } from '@/lib/sports/matchTypes'

const SPORT_META: Record<
  Exclude<SportMatchKind, 'all'>,
  { title: string; emoji: string; empty: string }
> = {
  futbol: {
    title: 'Futbol Maçları',
    emoji: '⚽',
    empty: 'Bugün futbol maçı yok — yakında program eklenecek.',
  },
  basketbol: {
    title: 'Basketbol Maçları',
    emoji: '🏀',
    empty: 'Bugün basketbol maçı yok — yakında program eklenecek.',
  },
  voleybol: {
    title: 'Voleybol Maçları',
    emoji: '🏐',
    empty: 'Bugün voleybol maçı yok — yakında program eklenecek.',
  },
}

function ScoreCard({ match }: { match: MatchResult }) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const homeWin = hasScore && match.homeScore! > match.awayScore!
  const awayWin = hasScore && match.awayScore! > match.homeScore!

  return (
    <div
      className={`flex min-w-[220px] flex-col gap-2 rounded-2xl border p-3 shadow-sm transition-colors
      ${
        isLive
          ? 'border-red-500/40 bg-red-950/20 dark:bg-red-950/30'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
          {match.league}
        </span>
        <span className="ml-auto shrink-0">
          {isLive ? (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              CANLI
            </span>
          ) : isFinished ? (
            <span className="text-[10px] font-bold text-[rgb(var(--color-muted))]">MS</span>
          ) : (
            <span className="text-[10px] font-medium text-emerald-500">{match.time}</span>
          )}
        </span>
      </div>

      {isLive && match.statusDetail ? (
        <p className="text-[10px] font-semibold text-red-400">{match.statusDetail}</p>
      ) : null}

      <div className={`flex items-center gap-2 ${homeWin ? 'opacity-100' : 'opacity-70'}`}>
        <Image
          src={match.homeBadge}
          alt={match.homeTeam}
          width={28}
          height={28}
          className="rounded-full object-contain"
          unoptimized
        />
        <span
          className={`flex-1 truncate text-[13px] ${
            homeWin
              ? 'font-bold text-[rgb(var(--color-text))]'
              : 'font-medium text-[rgb(var(--color-muted))]'
          }`}
        >
          {match.homeTeam}
        </span>
        <span
          className={`text-lg font-black tabular-nums ${
            isLive
              ? 'text-red-400'
              : homeWin
                ? 'text-[rgb(var(--color-text))]'
                : 'text-[rgb(var(--color-muted))]'
          }`}
        >
          {hasScore ? match.homeScore : '-'}
        </span>
      </div>

      <div className={`flex items-center gap-2 ${awayWin ? 'opacity-100' : 'opacity-70'}`}>
        <Image
          src={match.awayBadge}
          alt={match.awayTeam}
          width={28}
          height={28}
          className="rounded-full object-contain"
          unoptimized
        />
        <span
          className={`flex-1 truncate text-[13px] ${
            awayWin
              ? 'font-bold text-[rgb(var(--color-text))]'
              : 'font-medium text-[rgb(var(--color-muted))]'
          }`}
        >
          {match.awayTeam}
        </span>
        <span
          className={`text-lg font-black tabular-nums ${
            isLive
              ? 'text-red-400'
              : awayWin
                ? 'text-[rgb(var(--color-text))]'
                : 'text-[rgb(var(--color-muted))]'
          }`}
        >
          {hasScore ? match.awayScore : '-'}
        </span>
      </div>
    </div>
  )
}

export interface MatchResultsProps {
  /** Spor filtresi — kategori bölümüne göre. */
  sport?: Exclude<SportMatchKind, 'all'> | 'all'
  /** Başlık override (varsayılan spor meta). */
  title?: string
  className?: string
}

export function MatchResults({ sport = 'all', title, className }: MatchResultsProps) {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const [liveCount, setLiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const meta = sport !== 'all' ? SPORT_META[sport] : null
  const heading = title ?? meta?.title ?? 'Maç Skorları'
  const emoji = meta?.emoji ?? '🏟️'
  const emptyCopy = meta?.empty ?? 'Bugün aktif maç bulunamadı.'

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const qs = sport && sport !== 'all' ? `?sport=${sport}` : ''
      const res = await fetch(`/api/sports/matches${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as {
        matches: MatchResult[]
        dateLabel: string
        liveCount?: number
      }
      setMatches(data.matches)
      setDateLabel(data.dateLabel)
      setLiveCount(data.liveCount ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [sport])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const interval = setInterval(() => {
      void load()
    }, liveCount > 0 ? 30_000 : 120_000)
    return () => clearInterval(interval)
  }, [liveCount, load])

  return (
    <section className={className ?? 'mb-5'}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-base" aria-hidden>
          {emoji}
        </span>
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
          {heading}
          {dateLabel ? (
            <span
              className={`ml-2 text-[11px] font-normal ${
                liveCount > 0 ? 'text-red-400' : 'text-[rgb(var(--color-muted))]'
              }`}
            >
              · {dateLabel}
            </span>
          ) : null}
        </h2>
        {!loading ? (
          <button
            onClick={load}
            className="ml-auto text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
            aria-label="Yenile"
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex h-[120px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      ) : null}

      {error && !loading ? (
        <p className="px-1 text-xs text-[rgb(var(--color-muted))]">Maç sonuçları yüklenemedi.</p>
      ) : null}

      {!loading && !error && matches.length === 0 ? (
        <p className="px-1 text-xs text-[rgb(var(--color-muted))]">{emptyCopy}</p>
      ) : null}

      {!loading && matches.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {matches.map((m) => (
            <ScoreCard key={m.id} match={m} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** Kategori bölüm id → skor şeridi (yalnızca bu sporlar). */
export function sportMatchKindForSection(
  sectionId: string
): Exclude<SportMatchKind, 'all'> | null {
  if (sectionId === 'futbol') return 'futbol'
  if (sectionId === 'basketbol') return 'basketbol'
  if (sectionId === 'voleybol') return 'voleybol'
  return null
}
