'use client'

import Link from 'next/link'
import { ChevronRight, Gamepad2 } from 'lucide-react'
import { NAHABER_GAMES } from '@/constants/games'
import { ROUTES } from '@/constants/routes'
import type { GameCatalogItem } from '@/types/game'

const GAME_ACCENTS: Record<string, string> = {
  tavla: 'from-amber-600 to-amber-900',
  yilan: 'from-violet-500 to-fuchsia-600',
  satranc: 'from-emerald-700 to-teal-900',
  sudoku: 'from-teal-500 to-cyan-700',
  tetris: 'from-cyan-500 to-fuchsia-600',
}

function GameCard({ game }: { game: GameCatalogItem }) {
  const accent = GAME_ACCENTS[game.slug] ?? 'from-violet-600 to-indigo-800'
  return (
    <Link
      href={game.playHref}
      className="group w-[72vw] max-w-[240px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm transition hover:border-violet-500/40 hover:shadow-md sm:w-[220px]"
    >
      <div
        className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${accent} text-5xl`}
      >
        <span className="drop-shadow-lg transition group-hover:scale-110">{game.thumbnailEmoji}</span>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {game.category}
        </span>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-black text-[rgb(var(--color-text))]">{game.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-[rgb(var(--color-muted))]">
          {game.description}
        </p>
        <span className="mt-2 inline-flex text-xs font-bold text-violet-600 group-hover:underline">
          Oyna →
        </span>
      </div>
    </Link>
  )
}

interface GamesRailProps {
  /** Desktop home uses wider title spacing */
  variant?: 'mobile' | 'desktop'
}

export function GamesRail({ variant = 'mobile' }: GamesRailProps) {
  if (NAHABER_GAMES.length === 0) return null

  if (variant === 'desktop') {
    return (
      <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Online oyunlar">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-violet-600" />
            <h2 className="text-xl font-black text-[rgb(var(--color-text))]">Oyunlar</h2>
          </div>
          <Link
            href={ROUTES.GAMES}
            className="flex items-center gap-0.5 text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
          >
            Tüm oyunlar
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div
          className="flex gap-4 overflow-x-auto scroll-px-2 pb-2 scrollbar-hide"
          data-no-category-swipe
        >
          {NAHABER_GAMES.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="home-section" aria-label="Online oyunlar">
      <div className="home-rail-title justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="home-rail-accent shrink-0" aria-hidden />
          <Gamepad2 className="h-5 w-5 shrink-0 text-violet-600" />
          <h2 className="truncate text-lg font-black text-[rgb(var(--color-text))]">Oyunlar</h2>
        </div>
        <Link
          href={ROUTES.GAMES}
          className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[rgb(var(--color-brand))]"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div
        className="-mx-1 flex gap-3 overflow-x-auto scroll-px-3 px-1 pb-1 scrollbar-hide"
        data-no-category-swipe
      >
        {NAHABER_GAMES.map((game) => (
          <GameCard key={game.slug} game={game} />
        ))}
      </div>
    </section>
  )
}
