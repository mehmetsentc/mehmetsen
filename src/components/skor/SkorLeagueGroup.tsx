'use client'

import type { SkorBoardLeagueGroup } from '@/lib/skor/types'
import { SkorMatchRow } from '@/components/skor/SkorMatchRow'

function countryLabel(country: string): string {
  const map: Record<string, string> = {
    Turkey: 'Türkiye',
    England: 'İngiltere',
    Spain: 'İspanya',
    Germany: 'Almanya',
    Italy: 'İtalya',
    France: 'Fransa',
    USA: 'ABD',
    World: 'Dünya',
    Europe: 'Avrupa',
  }
  return map[country] ?? country
}

export function SkorLeagueGroup({
  group,
  onOpenStandings,
}: {
  group: SkorBoardLeagueGroup
  onOpenStandings?: (leagueId: string, title: string) => void
}) {
  return (
    <section className="skor-league" aria-label={`${group.leagueName} maçları`}>
      <div className="skor-league__head">
        <h3 className="skor-league__title">
          {countryLabel(group.country)} · {group.leagueName}
        </h3>
        {onOpenStandings ? (
          <button
            type="button"
            onClick={() => onOpenStandings(group.leagueId, group.leagueName)}
            className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]"
          >
            Puan
          </button>
        ) : null}
      </div>
      <div>
        {group.matches.map((m) => (
          <SkorMatchRow key={m.id} match={m} />
        ))}
      </div>
    </section>
  )
}
