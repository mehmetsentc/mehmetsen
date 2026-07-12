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

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']
const FINISHED_STATUSES = ['FT', 'AET', 'PEN']

function FormDot({ result }: { result: string }) {
  const color =
    result === 'W' ? 'bg-green-500' : result === 'L' ? 'bg-red-500' : 'bg-yellow-400'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={result} />
}

function StandingsTable({ standings }: { standings: Standing[] }) {
  if (standings.length === 0)
    return (
      <p className="py-6 text-center text-sm text-[rgb(var(--color-muted))]">
        Puan tablosu yüklenemedi.
      </p>
    )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] text-xs text-[rgb(var(--color-muted))]">
            <th className="py-2 pr-2 text-left">#</th>
            <th className="py-2 text-left">Takım</th>
            <th className="px-2 py-2 text-center">O</th>
            <th className="px-2 py-2 text-center">G</th>
            <th className="px-2 py-2 text-center">B</th>
            <th className="px-2 py-2 text-center">M</th>
            <th className="px-2 py-2 text-center">A</th>
            <th className="px-2 py-2 text-center">Puan</th>
            <th className="py-2 pl-2 text-center">Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.teamId}
              className="border-b border-[rgb(var(--color-border))] last:border-0 hover:bg-[rgb(var(--color-border))]/30"
            >
              <td className="py-2 pr-2 font-medium text-[rgb(var(--color-muted))]">{s.rank}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.teamLogo} alt="" className="h-5 w-5 object-contain" />
                  <span className="font-medium text-[rgb(var(--color-text))]">{s.teamName}</span>
                </div>
              </td>
              <td className="px-2 py-2 text-center text-[rgb(var(--color-muted))]">{s.played}</td>
              <td className="px-2 py-2 text-center text-green-500">{s.won}</td>
              <td className="px-2 py-2 text-center text-yellow-500">{s.draw}</td>
              <td className="px-2 py-2 text-center text-red-500">{s.lost}</td>
              <td className="px-2 py-2 text-center text-[rgb(var(--color-muted))]">
                {s.goalsFor}:{s.goalsAgainst}
              </td>
              <td className="px-2 py-2 text-center font-bold text-[rgb(var(--color-text))]">
                {s.points}
              </td>
              <td className="py-2 pl-2">
                <div className="flex justify-center gap-0.5">
                  {s.form
                    .split('')
                    .slice(-5)
                    .map((r, i) => (
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

function FixtureCard({ f }: { f: Fixture }) {
  const isLive = LIVE_STATUSES.includes(f.statusShort)
  const isFinished = FINISHED_STATUSES.includes(f.statusShort)
  const hasScore = f.homeGoals !== null && f.awayGoals !== null
  const matchTime = new Date(f.date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const matchDate = new Date(f.date).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <div
      className={`rounded-xl border p-4 ${
        isLive
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]'
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-[rgb(var(--color-muted))]">
        <span>Süper Lig</span>
        {isLive ? (
          <span className="flex items-center gap-1 font-bold text-red-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {f.elapsed ? `${f.elapsed}'` : 'CANLI'}
          </span>
        ) : isFinished ? (
          <span>Maç Sonu</span>
        ) : (
          <span>
            {matchDate} {matchTime}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="font-semibold text-[rgb(var(--color-text))]">{f.homeTeam}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.homeLogo} alt="" className="h-8 w-8 object-contain" />
        </div>
        <div className="text-center">
          {hasScore ? (
            <span className="text-xl font-bold text-[rgb(var(--color-text))]">
              {f.homeGoals} — {f.awayGoals}
            </span>
          ) : (
            <span className="text-lg font-medium text-[rgb(var(--color-muted))]">vs</span>
          )}
        </div>
        <div className="flex flex-1 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.awayLogo} alt="" className="h-8 w-8 object-contain" />
          <span className="font-semibold text-[rgb(var(--color-text))]">{f.awayTeam}</span>
        </div>
      </div>
    </div>
  )
}

export function FootballPage() {
  const [tab, setTab] = useState<'standings' | 'today' | 'upcoming'>('today')
  const [standings, setStandings] = useState<Standing[]>([])
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const load = (t: typeof tab) => {
    setLoading(true)
    const url = t === 'standings' ? '/api/football/standings' : `/api/football/fixtures?type=${t === 'today' ? 'today' : 'upcoming'}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (t === 'standings') setStandings(d.standings ?? [])
        else setFixtures(d.fixtures ?? [])
        setLastUpdate(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'today', label: 'Bugün' },
    { id: 'upcoming', label: 'Yaklaşan' },
    { id: 'standings', label: 'Puan Tablosu' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-[rgb(var(--color-brand))]" />
          <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">Süper Lig</h1>
        </div>
        <button
          onClick={() => load(tab)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-border))] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : tab === 'standings' ? (
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <StandingsTable standings={standings} />
        </div>
      ) : fixtures.length === 0 ? (
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-10 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-muted))]" />
          <p className="text-[rgb(var(--color-muted))]">
            {tab === 'today' ? 'Bugün Süper Lig maçı yok.' : 'Yaklaşan maç bulunamadı.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {fixtures.map((f) => (
            <FixtureCard key={f.id} f={f} />
          ))}
        </div>
      )}

      {lastUpdate && (
        <p className="mt-4 text-center text-xs text-[rgb(var(--color-muted))]">
          Son güncelleme:{' '}
          {lastUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
