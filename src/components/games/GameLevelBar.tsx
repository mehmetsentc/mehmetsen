'use client'

import { GAME_LEVELS, type GameLevelId } from '@/lib/games/progress'
import { Lock } from 'lucide-react'

interface GameLevelBarProps {
  current: GameLevelId
  unlocked: GameLevelId
  onSelect: (level: GameLevelId) => void
  /** Optional win hint under the bar */
  hint?: string
}

export function GameLevelBar({ current, unlocked, onSelect, hint }: GameLevelBarProps) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          Seviye {current}/3
        </p>
        {hint ? <p className="text-[11px] text-[rgb(var(--color-muted))]">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {GAME_LEVELS.map((lvl) => {
          const open = lvl.id <= unlocked
          const active = lvl.id === current
          return (
            <button
              key={lvl.id}
              type="button"
              disabled={!open}
              onClick={() => open && onSelect(lvl.id)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? 'bg-[rgb(var(--color-brand))] text-white'
                  : open
                    ? 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                    : 'cursor-not-allowed border border-dashed border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] opacity-60'
              }`}
              title={open ? lvl.label : `Önce seviye ${lvl.id - 1} tamamla`}
            >
              {!open ? <Lock className="h-3 w-3" aria-hidden /> : null}
              {lvl.id}. {lvl.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
