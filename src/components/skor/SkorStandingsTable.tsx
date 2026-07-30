'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { SportsStandingRow } from '@/lib/skor/types'

export function SkorStandingsTable({
  leagueId,
  season,
}: {
  leagueId: string
  season?: number | string
}) {
  const [rows, setRows] = useState<SportsStandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ leagueId })
    if (season != null) qs.set('season', String(season))
    fetch(`/api/skor/standings?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { rows?: SportsStandingRow[]; leagueName?: string | null }) => {
        if (cancelled) return
        setRows(d.rows ?? [])
        setTitle(d.leagueName ?? '')
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, season])

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
      </div>
    )
  }

  if (!rows.length) {
    return (
      <p className="px-1 text-xs text-[rgb(var(--color-muted))]">
        Puan tablosu henüz yok{title ? ` (${title})` : ''}.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Takım</th>
            <th className="px-2 py-2 text-center">O</th>
            <th className="px-2 py-2 text-center">Av</th>
            <th className="px-3 py-2 text-center font-bold">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className="border-b border-[rgb(var(--color-border))]/40 last:border-0">
              <td className="px-3 py-1.5 text-[rgb(var(--color-muted))]">{r.rank}</td>
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2 font-medium text-[rgb(var(--color-text))]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.teamLogo} alt="" className="h-5 w-5 object-contain" />
                  {r.teamName}
                </span>
              </td>
              <td className="px-2 py-1.5 text-center text-[rgb(var(--color-muted))]">{r.played}</td>
              <td className="px-2 py-1.5 text-center text-[rgb(var(--color-muted))]">
                {r.goalsFor - r.goalsAgainst}
              </td>
              <td className="px-3 py-1.5 text-center font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
