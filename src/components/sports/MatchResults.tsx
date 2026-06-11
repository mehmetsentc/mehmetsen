'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Loader2, RefreshCw } from 'lucide-react'
import type { MatchResult } from '@/app/api/sports/matches/route'

function ScoreCard({ match }: { match: MatchResult }) {
  const isFinished = match.homeScore !== null && match.awayScore !== null
  const homeWin = isFinished && match.homeScore! > match.awayScore!
  const awayWin = isFinished && match.awayScore! > match.homeScore!

  return (
    <div className="flex min-w-[220px] flex-col gap-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 shadow-sm">
      {/* League */}
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
          {match.league}
        </span>
        <span className="ml-auto text-[10px] text-[rgb(var(--color-muted))]">
          {match.status === 'finished' ? '✓' : match.time}
        </span>
      </div>

      {/* Home */}
      <div className={`flex items-center gap-2 ${homeWin ? 'opacity-100' : 'opacity-70'}`}>
        <Image
          src={match.homeBadge}
          alt={match.homeTeam}
          width={28}
          height={28}
          className="rounded-full object-contain"
          unoptimized
        />
        <span className={`flex-1 truncate text-[13px] ${homeWin ? 'font-bold text-[rgb(var(--color-text))]' : 'font-medium text-[rgb(var(--color-muted))]'}`}>
          {match.homeTeam}
        </span>
        <span className={`text-lg font-black tabular-nums ${homeWin ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'}`}>
          {isFinished ? match.homeScore : '-'}
        </span>
      </div>

      {/* Away */}
      <div className={`flex items-center gap-2 ${awayWin ? 'opacity-100' : 'opacity-70'}`}>
        <Image
          src={match.awayBadge}
          alt={match.awayTeam}
          width={28}
          height={28}
          className="rounded-full object-contain"
          unoptimized
        />
        <span className={`flex-1 truncate text-[13px] ${awayWin ? 'font-bold text-[rgb(var(--color-text))]' : 'font-medium text-[rgb(var(--color-muted))]'}`}>
          {match.awayTeam}
        </span>
        <span className={`text-lg font-black tabular-nums ${awayWin ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'}`}>
          {isFinished ? match.awayScore : '-'}
        </span>
      </div>

      {/* Date */}
      <p className="text-right text-[10px] text-[rgb(var(--color-muted))]">
        {match.date}
        {match.time ? (
          <span className="ml-1 font-medium text-emerald-500">{match.time}</span>
        ) : null}
      </p>
    </div>
  )
}

export function MatchResults() {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/sports/matches')
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { matches: MatchResult[]; dateLabel: string }
      setMatches(data.matches)
      setDateLabel(data.dateLabel)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-base">⚽</span>
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
          Maç Sonuçları
          {dateLabel && (
            <span className="ml-2 text-[11px] font-normal text-[rgb(var(--color-muted))]">
              · {dateLabel}
            </span>
          )}
        </h2>
        {!loading && (
          <button
            onClick={load}
            className="ml-auto text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
            aria-label="Yenile"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex h-[120px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      )}

      {error && !loading && (
        <p className="px-1 text-xs text-[rgb(var(--color-muted))]">
          Maç sonuçları yüklenemedi.
        </p>
      )}

      {!loading && !error && matches.length === 0 && (
        <p className="px-1 text-xs text-[rgb(var(--color-muted))]">
          Şu an aktif maç bulunamadı.
        </p>
      )}

      {!loading && matches.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {matches.map((m) => (
            <ScoreCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  )
}
