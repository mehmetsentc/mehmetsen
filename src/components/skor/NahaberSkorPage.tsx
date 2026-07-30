'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Trophy } from 'lucide-react'
import { SkorArchivePanel } from '@/components/skor/SkorArchivePanel'
import { SkorLeagueGroup } from '@/components/skor/SkorLeagueGroup'
import { SkorStandingsTable } from '@/components/skor/SkorStandingsTable'
import { CURRENT_SEASON } from '@/lib/skor/clientConstants'
import {
  FOOTBALL_STANDINGS_LEAGUES,
  SKOR_SPORTS,
  type SkorBoardLeagueGroup,
  type SkorBoardTab,
  type SkorSport,
} from '@/lib/skor/types'
import { cn } from '@/lib/utils'

const TABS: { id: SkorBoardTab; label: string }[] = [
  { id: 'live', label: 'Canlı' },
  { id: 'today', label: 'Bugün' },
  { id: 'results', label: 'Sonuçlar' },
  { id: 'program', label: 'Program' },
  { id: 'standings', label: 'Puan' },
  { id: 'archive', label: 'Arşiv' },
]

export function NahaberSkorPage() {
  const [sport, setSport] = useState<SkorSport>('futbol')
  const [tab, setTab] = useState<SkorBoardTab>('today')
  const [groups, setGroups] = useState<SkorBoardLeagueGroup[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [dateLabel, setDateLabel] = useState('')
  const [emptyReason, setEmptyReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [standingsPick, setStandingsPick] = useState('futbol_203')

  const load = useCallback(async () => {
    if (tab === 'standings' || tab === 'archive') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/skor/board?sport=${sport}&tab=${tab}`, { cache: 'no-store' })
      const data = (await res.json()) as {
        groups?: SkorBoardLeagueGroup[]
        liveCount?: number
        date?: string
        emptyReason?: string | null
      }
      setGroups(data.groups ?? [])
      setLiveCount(data.liveCount ?? 0)
      setDateLabel(data.date ?? '')
      setEmptyReason(data.emptyReason ?? null)
    } catch {
      setGroups([])
      setEmptyReason(null)
    } finally {
      setLoading(false)
    }
  }, [sport, tab])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab !== 'live' && tab !== 'today') return
    const ms = tab === 'live' || liveCount > 0 ? 30_000 : 120_000
    const t = setInterval(() => void load(), ms)
    return () => clearInterval(t)
  }, [tab, liveCount, load])

  useEffect(() => {
    if (sport !== 'futbol') return
    setStandingsPick('futbol_203')
  }, [sport])

  return (
    <div className="skor-page mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-4 sm:pt-5">
      <header className="mb-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--color-muted))]">
            NaHaber
          </p>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-2xl">
            <Trophy className="h-5 w-5 text-[rgb(var(--color-brand))]" aria-hidden />
            Skor
            {liveCount > 0 ? (
              <span className="text-sm font-semibold text-red-500">{liveCount} canlı</span>
            ) : dateLabel ? (
              <span className="text-sm font-normal text-[rgb(var(--color-muted))]">{dateLabel}</span>
            ) : null}
          </h1>
        </div>
        {tab !== 'standings' && tab !== 'archive' ? (
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
            aria-label="Yenile"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        ) : null}
      </header>

      <div className="skor-cookie-rail" role="tablist" aria-label="Spor">
        {SKOR_SPORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-pressed={sport === s.id}
            className="skor-cookie"
            onClick={() => setSport(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="skor-tab-rail" role="tablist" aria-label="Gün panosu">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-pressed={tab === t.id}
            className="skor-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'live' && liveCount > 0 ? <span className="skor-pulse ml-1.5" /> : null}
          </button>
        ))}
      </div>

      {tab === 'standings' ? (
        sport === 'futbol' ? (
          <div className="space-y-3">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {FOOTBALL_STANDINGS_LEAGUES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setStandingsPick(l.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold',
                    standingsPick === l.id
                      ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                      : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <SkorStandingsTable leagueId={standingsPick} season={CURRENT_SEASON} />
          </div>
        ) : (
          <p className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-surface))] px-3 py-3 text-xs text-[rgb(var(--color-muted))]">
            Puan tablosu v1’de futbol ligleri için aktif. Basketbol / voleybol puanları yakında.
          </p>
        )
      ) : tab === 'archive' ? (
        <SkorArchivePanel sport={sport} />
      ) : loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-surface))] px-3 py-2.5 text-[11px] leading-snug text-[rgb(var(--color-muted))]">
          {tab === 'live'
            ? 'Şu an canlı maç yok.'
            : tab === 'today' || emptyReason === 'no_matches_today'
              ? 'Bugün maç yok — Program sekmesine bakın.'
              : tab === 'results'
                ? 'Sonuç bulunamadı.'
                : 'Yaklaşan program yok.'}
          {tab === 'today' || emptyReason === 'no_matches_today' ? (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setTab('program')}
                className="font-semibold text-[rgb(var(--color-brand))]"
              >
                Program →
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <div>
          {groups.map((g) => (
            <SkorLeagueGroup
              key={g.key}
              group={g}
              onOpenStandings={
                sport === 'futbol'
                  ? (id) => {
                      setStandingsPick(id.startsWith('futbol_') ? id : 'futbol_203')
                      setTab('standings')
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
