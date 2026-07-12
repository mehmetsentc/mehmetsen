'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'

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

function StatusBadge({ status, elapsed }: { status: string; elapsed: number | null }) {
  const isLive = LIVE_STATUSES.includes(status)
  const isFinished = FINISHED_STATUSES.includes(status)

  if (isLive) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-red-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        {elapsed ? `${elapsed}'` : 'CANLI'}
      </span>
    )
  }
  if (isFinished) return <span className="text-xs text-[rgb(var(--color-muted))]">MS</span>
  // Not started — show time
  const d = new Date(status === 'NS' ? '' : '')
  return <span className="text-xs text-[rgb(var(--color-muted))]">-</span>
}

interface FixtureRowProps {
  fixture: Fixture
}

function FixtureRow({ fixture }: FixtureRowProps) {
  const isLive = LIVE_STATUSES.includes(fixture.statusShort)
  const hasScore = fixture.homeGoals !== null && fixture.awayGoals !== null
  const matchTime = new Date(fixture.date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        isLive ? 'bg-red-500/5 ring-1 ring-red-500/20' : ''
      }`}
    >
      {/* Ev sahibi */}
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <span className="truncate font-medium text-[rgb(var(--color-text))]">
          {fixture.homeTeam}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fixture.homeLogo} alt="" className="h-5 w-5 object-contain" />
      </div>

      {/* Skor / Saat */}
      <div className="flex min-w-[60px] flex-col items-center">
        {hasScore ? (
          <span className="text-base font-bold text-[rgb(var(--color-text))]">
            {fixture.homeGoals} — {fixture.awayGoals}
          </span>
        ) : (
          <span className="text-sm font-medium text-[rgb(var(--color-muted))]">{matchTime}</span>
        )}
        <StatusBadge status={fixture.statusShort} elapsed={fixture.elapsed} />
      </div>

      {/* Deplasman */}
      <div className="flex flex-1 items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fixture.awayLogo} alt="" className="h-5 w-5 object-contain" />
        <span className="truncate font-medium text-[rgb(var(--color-text))]">
          {fixture.awayTeam}
        </span>
      </div>
    </div>
  )
}

export function FootballWidget() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<'today' | 'upcoming'>('today')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/football/fixtures?type=${type}&league=203`)
      .then((r) => r.json())
      .then((d) => setFixtures(d.fixtures ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [type])

  if (!loading && fixtures.length === 0 && type === 'today') {
    // Bugün maç yoksa yaklaşanları göster
    if (type === 'today') {
      setType('upcoming')
      return null
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[rgb(var(--color-brand))]" aria-hidden />
          <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Süper Lig</h2>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setType('today')}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              type === 'today'
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            Bugün
          </button>
          <button
            onClick={() => setType('upcoming')}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              type === 'upcoming'
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            Yaklaşan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <p className="py-4 text-center text-xs text-[rgb(var(--color-muted))]">
          {type === 'today' ? 'Bugün maç yok' : 'Yaklaşan maç bulunamadı'}
        </p>
      ) : (
        <div className="space-y-1">
          {fixtures.map((f) => (
            <FixtureRow key={f.id} fixture={f} />
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-[rgb(var(--color-border))] pt-2.5">
        <Link
          href="/futbol-canli"
          className="text-xs font-medium text-[rgb(var(--color-brand))] hover:underline"
        >
          Puan tablosu ve tüm maçlar →
        </Link>
      </div>
    </section>
  )
}
