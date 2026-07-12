'use client'

import { useEffect, useState } from 'react'
import { Trophy, RefreshCw } from 'lucide-react'

interface Standing {
  rank: number
  teamId: number
  teamName: string
  teamLogo: string
  played: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  form: string
}

interface Fixture {
  id: number
  date: string
  statusShort: string
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  elapsed: number | null
}

const LEAGUES: { id: number; label: string; short: string }[] = [
  { id: 203, label: 'Süper Lig',  short: 'Süper Lig' },
  { id: 204, label: 'TFF 1. Lig', short: '1. Lig' },
  { id: 205, label: 'TFF 2. Lig', short: '2. Lig' },
  { id: 206, label: 'TFF 3. Lig', short: '3. Lig' },
]

const CONTENT_TABS = [
  { id: 'today',     label: 'Bugün' },
  { id: 'upcoming',  label: 'Yaklaşan' },
  { id: 'past',      label: 'Geçmiş' },
  { id: 'standings', label: 'Puan Tablosu' },
] as const
type ContentTab = typeof CONTENT_TABS[number]['id']

const LIVE_STATUSES     = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']
const FINISHED_STATUSES = ['FT', 'AET', 'PEN']

function FormDot({ result }: { result: string }) {
  const color =
    result === 'W' ? 'bg-green-500' :
    result === 'L' ? 'bg-red-500'   :
    'bg-yellow-400'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={result} />
}

function StandingsTable({ standings }: { standings: Standing[] }) {
  if (standings.length === 0)
    return (
      <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">
        Puan tablosu yüklenemedi.
      </p>
    )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <th className="py-2 pr-2 text-left">#</th>
            <th className="py-2 text-left">Takım</th>
            <th className="px-1 py-2 text-center">O</th>
            <th className="px-1 py-2 text-center">G</th>
            <th className="px-1 py-2 text-center">B</th>
            <th className="px-1 py-2 text-center">M</th>
            <th className="px-1 py-2 text-center">Av</th>
            <th className="px-1 py-2 text-center font-bold">P</th>
            <th className="py-2 pl-2 text-center">Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.teamId}
              className="border-b border-[rgb(var(--color-border))] last:border-0 hover:bg-[rgb(var(--color-border))]/30"
            >
              <td className="py-1.5 pr-2 text-xs font-medium text-[rgb(var(--color-muted))]">{s.rank}</td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.teamLogo} alt="" className="h-5 w-5 object-contain" />
                  <span className="text-[13px] font-medium text-[rgb(var(--color-text))]">{s.teamName}</span>
                </div>
              </td>
              <td className="px-1 py-1.5 text-center text-xs text-[rgb(var(--color-muted))]">{s.played}</td>
              <td className="px-1 py-1.5 text-center text-xs text-green-500">{s.won}</td>
              <td className="px-1 py-1.5 text-center text-xs text-yellow-500">{s.draw}</td>
              <td className="px-1 py-1.5 text-center text-xs text-red-500">{s.lost}</td>
              <td className="px-1 py-1.5 text-center text-xs text-[rgb(var(--color-muted))]">
                {s.goalsFor - s.goalsAgainst > 0 ? '+' : ''}{s.goalsFor - s.goalsAgainst}
              </td>
              <td className="px-1 py-1.5 text-center text-sm font-bold text-[rgb(var(--color-text))]">
                {s.points}
              </td>
              <td className="py-1.5 pl-2">
                <div className="flex justify-center gap-0.5">
                  {s.form.split('').slice(-5).map((r, i) => (
                    <FormDot key={i} result={r} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FixtureCard({ f, leagueName }: { f: Fixture; leagueName: string }) {
  const isLive     = LIVE_STATUSES.includes(f.statusShort)
  const isFinished = FINISHED_STATUSES.includes(f.statusShort)
  const hasScore   = f.homeGoals !== null && f.awayGoals !== null

  const matchDate = new Date(f.date).toLocaleDateString('tr-TR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const matchTime = new Date(f.date).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      className={`rounded-xl border p-3 ${
        isLive
          ? 'border-red-500/40 bg-red-500/5'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]'
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-[10px] text-[rgb(var(--color-muted))]">
        <span className="font-medium">{leagueName}</span>
        {isLive ? (
          <span className="flex items-center gap-1 font-bold text-red-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {f.elapsed ? `${f.elapsed}'` : 'CANLI'}
          </span>
        ) : isFinished ? (
          <span className="text-[rgb(var(--color-muted))]">Maç Sonu · {matchDate}</span>
        ) : (
          <span>{matchDate} · {matchTime}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="text-right text-sm font-semibold text-[rgb(var(--color-text))]">{f.homeTeam}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.homeLogo} alt="" className="h-7 w-7 shrink-0 object-contain" />
        </div>
        <div className="w-16 shrink-0 text-center">
          {hasScore ? (
            <span className={`text-lg font-bold ${isLive ? 'text-red-500' : 'text-[rgb(var(--color-text))]'}`}>
              {f.homeGoals} - {f.awayGoals}
            </span>
          ) : (
            <span className="text-sm font-medium text-[rgb(var(--color-muted))]">vs</span>
          )}
        </div>
        <div className="flex flex-1 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.awayLogo} alt="" className="h-7 w-7 shrink-0 object-contain" />
          <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{f.awayTeam}</span>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ tab }: { tab: ContentTab }) {
  const messages: Record<ContentTab, string> = {
    today:     'Bugün bu ligde maç yok.',
    upcoming:  'Yaklaşan maç bulunamadı.',
    past:      'Bu sezon için maç verisi yok.',
    standings: 'Puan tablosu yüklenemedi.',
  }
  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-10 text-center">
      <Trophy className="mx-auto mb-3 h-9 w-9 text-[rgb(var(--color-muted))]" />
      <p className="text-sm text-[rgb(var(--color-muted))]">{messages[tab]}</p>
    </div>
  )
}

export function FootballPage() {
  const [leagueId,    setLeagueId]    = useState(203)
  const [contentTab,  setContentTab]  = useState<ContentTab>('today')
  const [season,      setSeason]      = useState(2024)

  const [standings, setStandings] = useState<Standing[]>([])
  const [fixtures,  setFixtures]  = useState<Fixture[]>([])
  const [loading,   setLoading]   = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const leagueName = LEAGUES.find(l => l.id === leagueId)?.label ?? 'Lig'

  const load = (tab: ContentTab, lid: number, s: number) => {
    setLoading(true)
    let url: string
    if (tab === 'standings') {
      url = `/api/football/standings?league=${lid}&season=${s}`
    } else {
      url = `/api/football/fixtures?type=${tab}&league=${lid}&season=${s}`
    }
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (tab === 'standings') setStandings(d.standings ?? [])
        else setFixtures(d.fixtures ?? [])
        setLastUpdate(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setStandings([])
    setFixtures([])
    load(contentTab, leagueId, season)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTab, leagueId, season])

  const showSeasonPicker = contentTab === 'standings' || contentTab === 'past'

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">

      {/* Başlık + yenile */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-[rgb(var(--color-brand))]" />
          <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">Türkiye Futbolu</h1>
        </div>
        <button
          onClick={() => load(contentTab, leagueId, season)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-border))] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Lig sekmeler */}
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLeagueId(l.id)}
            className={`flex-1 shrink-0 rounded-lg py-2 text-xs font-semibold whitespace-nowrap px-2 transition-colors ${
              leagueId === l.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            {l.short}
          </button>
        ))}
      </div>

      {/* İçerik sekmeler */}
      <div className="mb-4 flex gap-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1">
        {CONTENT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setContentTab(t.id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              contentTab === t.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sezon seçici (Geçmiş + Puan Tablosu için) */}
      {showSeasonPicker && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-[rgb(var(--color-muted))]">Sezon:</span>
          {[2023, 2024].map((s) => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              className={`rounded-lg px-3 py-1 text-xs font-medium border transition-colors ${
                season === s
                  ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                  : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-brand))]/50'
              }`}
            >
              {s}-{(s + 1).toString().slice(2)}
            </button>
          ))}
        </div>
      )}

      {/* İçerik */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : contentTab === 'standings' ? (
        standings.length === 0
          ? <EmptyState tab="standings" />
          : (
            <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
              <StandingsTable standings={standings} />
            </div>
          )
      ) : fixtures.length === 0 ? (
        <EmptyState tab={contentTab} />
      ) : (
        <div className="space-y-2">
          {fixtures.map((f) => (
            <FixtureCard key={f.id} f={f} leagueName={leagueName} />
          ))}
        </div>
      )}

      {lastUpdate && (
        <p className="mt-5 text-center text-xs text-[rgb(var(--color-muted))]">
          Son güncelleme:{' '}
          {lastUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
