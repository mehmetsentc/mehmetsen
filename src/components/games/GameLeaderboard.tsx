'use client'

import { Medal, Trophy } from 'lucide-react'
import { useGameScores } from '@/hooks/useGameScores'
import { cn } from '@/lib/utils'

interface GameLeaderboardProps {
  gameSlug: string
  dark?: boolean
}

export function GameLeaderboard({ gameSlug, dark }: GameLeaderboardProps) {
  const { leaders, myBest, loading, metric, formatValue } = useGameScores(gameSlug)

  return (
    <section
      className={cn(
        'mt-6 rounded-2xl border p-4',
        dark
          ? 'border-white/15 bg-white/5 text-white'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]'
      )}
      aria-label="Sıralama"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Trophy className="h-4 w-4 text-amber-500" />
          Sıralama
        </h2>
        {myBest !== null ? (
          <p className={cn('text-xs font-semibold', dark ? 'text-white/70' : 'text-[rgb(var(--color-muted))]')}>
            Senin en iyin: {formatValue(myBest, metric)}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className={cn('text-xs', dark ? 'text-white/50' : 'text-[rgb(var(--color-muted))]')}>
          Yükleniyor…
        </p>
      ) : leaders.length === 0 ? (
        <p className={cn('text-xs', dark ? 'text-white/50' : 'text-[rgb(var(--color-muted))]')}>
          Henüz skor yok — ilk kaydı sen bırak!
        </p>
      ) : (
        <ol className="space-y-1.5">
          {leaders.map((row) => (
            <li
              key={row.userId}
              className={cn(
                'flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm',
                dark ? 'bg-black/20' : 'bg-[rgb(var(--color-card))]'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
                  row.rank === 1
                    ? 'bg-amber-400 text-amber-950'
                    : row.rank === 2
                      ? 'bg-zinc-300 text-zinc-800'
                      : row.rank === 3
                        ? 'bg-orange-300 text-orange-950'
                        : dark
                          ? 'bg-white/10 text-white/70'
                          : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
                )}
              >
                {row.rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {row.displayName || row.username || 'Oyuncu'}
              </span>
              <span className="shrink-0 font-bold tabular-nums">
                {formatValue(row.displayValue, row.metric)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
