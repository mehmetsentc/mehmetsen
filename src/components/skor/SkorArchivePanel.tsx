'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SkorLeagueGroup } from '@/components/skor/SkorLeagueGroup'
import { SkorStandingsTable } from '@/components/skor/SkorStandingsTable'
import { CURRENT_SEASON } from '@/lib/skor/clientConstants'
import type { SkorBoardLeagueGroup, SkorSport, SportsLeagueDoc, SportsSeasonDoc } from '@/lib/skor/types'
import { cn } from '@/lib/utils'

export function SkorArchivePanel({ sport }: { sport: SkorSport }) {
  const [leagues, setLeagues] = useState<SportsLeagueDoc[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [seasons, setSeasons] = useState<SportsSeasonDoc[]>([])
  const [season, setSeason] = useState<number | string>(CURRENT_SEASON)
  const [groups, setGroups] = useState<SkorBoardLeagueGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/skor/archive?sport=${sport}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { leagues?: SportsLeagueDoc[] }) => {
        if (cancelled) return
        const list = d.leagues ?? []
        setLeagues(list)
        const preferred =
          list.find((l) => l.id === 'futbol_203') ??
          list.find((l) => l.sport === sport) ??
          list[0]
        if (preferred) setLeagueId(preferred.id)
      })
      .catch(() => {
        if (!cancelled) setLeagues([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sport])

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ leagueId, season: String(season) })
    fetch(`/api/skor/archive?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (d: {
          seasons?: SportsSeasonDoc[]
          matches?: SkorBoardLeagueGroup[]
          season?: number | string
        }) => {
          if (cancelled) return
          setSeasons(d.seasons ?? [])
          setGroups(d.matches ?? [])
          if (d.seasons?.length && !d.seasons.some((s) => String(s.year) === String(season))) {
            setSeason(d.seasons[0]!.year)
          }
        }
      )
      .catch(() => {
        if (!cancelled) {
          setGroups([])
          setSeasons([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, season])

  const seasonOptions =
    seasons.length > 0
      ? seasons.map((s) => s.year)
      : [CURRENT_SEASON, CURRENT_SEASON - 1, CURRENT_SEASON - 2]

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {leagues.slice(0, 24).map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLeagueId(l.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold',
              leagueId === l.id
                ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
            )}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {seasonOptions.map((y) => (
          <button
            key={String(y)}
            type="button"
            onClick={() => setSeason(y)}
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold',
              String(season) === String(y)
                ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-card))]'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {leagueId ? <SkorStandingsTable leagueId={leagueId} season={season} /> : null}

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Bu sezon için arşiv maçı henüz birikmedi — senkron sonrası dolacak.
        </p>
      ) : (
        groups.map((g) => <SkorLeagueGroup key={g.key} group={g} />)
      )}
    </div>
  )
}
