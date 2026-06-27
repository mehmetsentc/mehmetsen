'use client'

/**
 * WorldCupCategoryTabs — 2026 FIFA Dünya Kupası kategori sayfası
 *
 * Kaydırmalı chip navigation:
 *   [📰 Haberler] [Grup A] [Grup B] ... [Grup L]
 *
 * Veri: `WorldCup2026Data` (ESPN'den 15 dk cache'li server fetch). Sayfa
 * bileşeni veriyi `initialData` prop'u ile aktarır.
 */

import { useState } from 'react'
import { Trophy, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import type { TimelinePost } from '@/types/post'
import type { WorldCup2026Data, WcGroup, WcMatch } from '@/services/sportsApi/worldCup2026'

// ─── Sub-Components ───────────────────────────────────────────────────────────
function StandingsTable({ group }: { group: WcGroup }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex items-center gap-2 bg-amber-500 px-3 py-2">
        <Trophy className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-black text-white">{group.name} Puan Durumu</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            <th className="px-2 py-1.5 text-left font-semibold text-[rgb(var(--color-muted))]">Takım</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">O</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">G</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">B</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">M</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">A/Y</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">AV</th>
            <th className="px-2 py-1.5 text-center font-bold text-[rgb(var(--color-text))]">P</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((t, i) => (
            <tr
              key={t.team}
              className={cn(
                'border-b border-[rgb(var(--color-border))] last:border-0',
                t.isTurkiye && 'bg-red-50 dark:bg-red-950/20',
                i < 2 && !t.isTurkiye && 'bg-emerald-50/50 dark:bg-emerald-950/10',
              )}
            >
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white',
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                  )}>{i + 1}</span>
                  <span className="text-sm leading-none">{t.flag}</span>
                  <span className={cn('font-semibold', t.isTurkiye ? 'text-red-600 dark:text-red-400' : 'text-[rgb(var(--color-text))]')}>
                    {t.team}
                  </span>
                  {t.isTurkiye && (
                    <span className="rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-black text-red-600 dark:bg-red-900/40 dark:text-red-400">TR</span>
                  )}
                </div>
              </td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.p}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.w}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.d}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.l}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.gf}:{t.ga}</td>
              <td className={cn('px-1 py-2 text-center font-semibold text-xs',
                t.gd > 0 ? 'text-emerald-600' : t.gd < 0 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'
              )}>
                {t.gd > 0 ? `+${t.gd}` : t.gd}
              </td>
              <td className="px-2 py-2 text-center">
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{t.pts}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3 px-3 py-1.5 text-[10px] text-[rgb(var(--color-muted))]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Tur atlıyor (ilk 2)
        </span>
      </div>
    </div>
  )
}

function MatchRow({ match }: { match: WcMatch }) {
  const hasTurkiye = match.home === 'Türkiye' || match.away === 'Türkiye'
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs',
      hasTurkiye
        ? 'border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20'
        : match.finished
          ? 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20',
    )}>
      <span className="w-14 shrink-0 text-center text-[10px] text-[rgb(var(--color-muted))]">{match.date}</span>
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <span className="text-right font-semibold text-[rgb(var(--color-text))]">{match.home}</span>
        <span className="text-sm">{match.homeFlag}</span>
      </div>
      <div className={cn(
        'flex w-12 shrink-0 items-center justify-center rounded-lg px-1.5 py-1 text-sm font-black',
        match.isLive
          ? 'bg-red-500 text-white animate-pulse'
          : match.finished
            ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      )}>
        {match.finished || match.isLive ? `${match.homeScore}–${match.awayScore}` : 'vs'}
      </div>
      <div className="flex flex-1 items-center gap-1.5">
        <span className="text-sm">{match.awayFlag}</span>
        <span className="font-semibold text-[rgb(var(--color-text))]">{match.away}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
type ActiveChip = 'haberler' | string  // string = grup ID ('A'…'L')

interface Props {
  initialPosts?: TimelinePost[]
  data: WorldCup2026Data
}

export function WorldCupCategoryTabs({ initialPosts, data }: Props) {
  const [active, setActive] = useState<ActiveChip>('haberler')

  const groups = data.groups
  const matches = data.matches

  const chips: { id: ActiveChip; label: string }[] = [
    { id: 'haberler', label: '📰 Haberler' },
    ...groups.map(g => ({
      id: g.id,
      // Türkiye hangi gruptaysa onu işaretle
      label: g.teams.some(t => t.isTurkiye) ? `🇹🇷 ${g.name}` : g.name,
    })),
  ]

  const activeGroup = active !== 'haberler'
    ? groups.find(g => g.id === active) ?? null
    : null

  const groupMatches = activeGroup
    ? matches.filter(m => m.group === activeGroup.id)
    : []

  const updatedAt = data.updatedAt && data.source === 'espn'
    ? new Date(data.updatedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div>
      {/* ── Kaydırmalı chip bar ── */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {chips.map(chip => {
          const isActive = active === chip.id
          return (
            <button
              key={chip.id}
              onClick={() => setActive(chip.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-amber-400 bg-amber-500 text-white'
                  : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-amber-300 hover:text-amber-600',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* ── Haberler ── CategoryFeed her zaman mount'lu, sadece görünürlük değişir */}
      <div className={active === 'haberler' ? '' : 'hidden'}>
        <CategoryFeed categoryId="dunya-kupasi-2026" initialPosts={initialPosts} />
      </div>

      {/* ── Grup görünümü ── */}
      {activeGroup && (
        <div className="space-y-4">
          {/* Puan durumu */}
          <StandingsTable group={activeGroup} />

          {/* Maç sonuçları */}
          {groupMatches.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">
                {activeGroup.name} Maçları
              </h3>
              <div className="space-y-2">
                {groupMatches.map((m, i) => (
                  <MatchRow key={i} match={m} />
                ))}
              </div>
            </div>
          )}

          {/* Güncelleme notu */}
          <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-[rgb(var(--color-muted))]">
            <RefreshCw className="h-3 w-3" />
            {updatedAt
              ? <>Güncelleme: {updatedAt} · Kaynak: ESPN</>
              : <>Kaynak: ESPN — anlık veri alınamadı, son bilinen veri gösteriliyor</>
            }
          </p>
        </div>
      )}
    </div>
  )
}
