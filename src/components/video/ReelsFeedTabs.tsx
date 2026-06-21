'use client'

import { cn } from '@/lib/utils'

// 'for-you' | 'following' | '<categoryId>'
export type ReelsFeedTab = 'for-you' | 'following' | string

export const REELS_MAIN_TABS: { id: ReelsFeedTab; label: string }[] = [
  { id: 'for-you',   label: 'Senin için' },
  { id: 'following', label: 'Takip' },
]

export const REELS_CATEGORY_TABS: { id: string; label: string; emoji: string }[] = [
  { id: 'gundem',    label: 'Gündem',    emoji: '📰' },
  { id: 'spor',      label: 'Spor',      emoji: '⚽' },
  { id: 'magazin',   label: 'Magazin',   emoji: '⭐' },
  { id: 'teknoloji', label: 'Teknoloji', emoji: '💻' },
  { id: 'ekonomi',   label: 'Ekonomi',   emoji: '📈' },
  { id: 'dunya',     label: 'Dünya',     emoji: '🌍' },
  { id: 'kultur',    label: 'Kültür',    emoji: '🎭' },
  { id: 'saglik',    label: 'Sağlık',    emoji: '❤️' },
]

/** Verilen tab bir kategori mi (main tab değil mi)? */
export function isCategoryTab(tab: ReelsFeedTab): boolean {
  return tab !== 'for-you' && tab !== 'following'
}

interface ReelsFeedTabsProps {
  active: ReelsFeedTab
  onChange: (tab: ReelsFeedTab) => void
}

export function ReelsFeedTabs({ active, onChange }: ReelsFeedTabsProps) {
  return (
    <div className="flex flex-col gap-0">
      {/* ── Ana sekmeler: Senin için / Takip ── */}
      <div className="flex items-center gap-6 sm:gap-8">
        {REELS_MAIN_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'border-b-2 pb-2 text-sm font-semibold transition-colors sm:text-base',
              active === id
                ? 'border-blue-500 text-[rgb(var(--color-text))]'
                : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Kategori chips: yatay scroll ── */}
      <div className="hide-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 pb-2 pt-2">
        {REELS_CATEGORY_TABS.map(({ id, label, emoji }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all',
              active === id
                ? 'bg-white text-black shadow'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            )}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
