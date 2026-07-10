'use client'

/**
 * WorldCupCategoryTabs — 2026 FIFA Dünya Kupası kategori sayfası
 * Haber akışı üst bileşende (CategoryThemedFeed); burada yalnızca sekmeler + grup verisi.
 */

import { Trophy, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorldCup2026Data, WcGroup, WcMatch } from '@/services/sportsApi/worldCup2026'

function StandingsTable({ group }: { group: WcGroup }) {
  return (
    <div className="bbc-wc-panel overflow-hidden rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
        <Trophy className="h-4 w-4 text-amber-600" aria-hidden />
        <span className="text-sm font-bold text-[rgb(var(--color-text))]">{group.name} puan durumu</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/60">
              <th className="px-3 py-2 text-left font-semibold text-[rgb(var(--color-muted))]">Takım</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">O</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">G</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">B</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">M</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">A/Y</th>
              <th className="px-2 py-2 text-center font-semibold text-[rgb(var(--color-muted))]">AV</th>
              <th className="px-3 py-2 text-center font-bold text-[rgb(var(--color-text))]">P</th>
            </tr>
          </thead>
          <tbody>
            {group.teams.map((t, i) => (
              <tr
                key={t.team}
                className={cn(
                  'border-b border-[rgb(var(--color-border))] last:border-0',
                  t.isTurkiye && 'bg-red-500/5',
                  i < 2 && !t.isTurkiye && 'bg-emerald-500/5'
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                        i === 0
                          ? 'bg-amber-500'
                          : i === 1
                            ? 'bg-slate-400'
                            : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-base leading-none">{t.flag}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        t.isTurkiye ? 'text-red-600 dark:text-red-400' : 'text-[rgb(var(--color-text))]'
                      )}
                    >
                      {t.team}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-[rgb(var(--color-muted))]">{t.p}</td>
                <td className="px-2 py-2.5 text-center text-[rgb(var(--color-muted))]">{t.w}</td>
                <td className="px-2 py-2.5 text-center text-[rgb(var(--color-muted))]">{t.d}</td>
                <td className="px-2 py-2.5 text-center text-[rgb(var(--color-muted))]">{t.l}</td>
                <td className="px-2 py-2.5 text-center text-[rgb(var(--color-muted))]">
                  {t.gf}:{t.ga}
                </td>
                <td
                  className={cn(
                    'px-2 py-2.5 text-center text-sm font-semibold',
                    t.gd > 0 ? 'text-emerald-600' : t.gd < 0 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'
                  )}
                >
                  {t.gd > 0 ? `+${t.gd}` : t.gd}
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-[rgb(var(--color-text))]">{t.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatchRow({ match }: { match: WcMatch }) {
  const hasTurkiye = match.home === 'Türkiye' || match.away === 'Türkiye'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm',
        hasTurkiye
          ? 'border-red-300/50 bg-red-500/5'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
      )}
    >
      <time className="w-20 shrink-0 text-xs text-[rgb(var(--color-muted))]">{match.date}</time>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right font-semibold text-[rgb(var(--color-text))]">{match.home}</span>
        <span>{match.homeFlag}</span>
      </div>
      <div
        className={cn(
          'flex w-14 shrink-0 items-center justify-center rounded-md px-2 py-1 text-sm font-bold',
          match.isLive
            ? 'bg-red-600 text-white'
            : match.finished
              ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        )}
      >
        {match.finished || match.isLive ? `${match.homeScore}–${match.awayScore}` : 'vs'}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span>{match.awayFlag}</span>
        <span className="truncate font-semibold text-[rgb(var(--color-text))]">{match.away}</span>
      </div>
    </div>
  )
}

type ActiveChip = 'haberler' | string

interface Props {
  data: WorldCup2026Data
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export function WorldCupCategoryTabs({ data, activeTab = 'haberler', onTabChange }: Props) {
  const groups = data.groups
  const matches = data.matches

  const chips: { id: ActiveChip; label: string }[] = [
    { id: 'haberler', label: 'Haberler' },
    ...groups.map((g) => ({
      id: g.id,
      label: g.teams.some((t) => t.isTurkiye) ? `🇹🇷 ${g.name}` : g.name,
    })),
  ]

  const activeGroup = activeTab !== 'haberler' ? groups.find((g) => g.id === activeTab) ?? null : null
  const groupMatches = activeGroup ? matches.filter((m) => m.group === activeGroup.id) : []

  const updatedAt =
    data.updatedAt && data.source === 'espn'
      ? new Date(data.updatedAt).toLocaleString('tr-TR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

  return (
    <div className="bbc-wc-tabs">
      <nav
        className="bbc-category-subnav flex gap-0 overflow-x-auto border-b border-[rgb(var(--color-border))] scrollbar-hide"
        aria-label="Dünya Kupası sekmeleri"
      >
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onTabChange?.(chip.id)}
            className={cn('bbc-category-subnav-item', activeTab === chip.id && 'is-active')}
          >
            {chip.label}
          </button>
        ))}
      </nav>

      {activeGroup ? (
        <div className="mt-6 space-y-6">
          <StandingsTable group={activeGroup} />
          {groupMatches.length > 0 ? (
            <section aria-label={`${activeGroup.name} maçları`}>
              <h3 className="bbc-section-label mb-3">{activeGroup.name} maçları</h3>
              <div className="space-y-2">
                {groupMatches.map((m, i) => (
                  <MatchRow key={i} match={m} />
                ))}
              </div>
            </section>
          ) : null}
          <p className="flex items-center justify-center gap-2 text-center text-xs text-[rgb(var(--color-muted))]">
            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {updatedAt
              ? `Güncelleme: ${updatedAt} · Kaynak: ESPN`
              : 'Kaynak: ESPN — anlık veri alınamadı'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
