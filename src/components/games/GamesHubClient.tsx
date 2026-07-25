'use client'

import Link from 'next/link'
import { Gamepad2 } from 'lucide-react'
import { NAHABER_GAMES } from '@/constants/games'
import { ROUTES } from '@/constants/routes'

export function GamesHubClient() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-16">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-violet-600">
          <Gamepad2 className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-wide">NaHaber Oyun</span>
        </div>
        <h1 className="text-3xl font-black text-[rgb(var(--color-text))]">Online Oyunlar</h1>
        <p className="mt-2 max-w-2xl text-[rgb(var(--color-muted))]">
          Haber arası molada oynayın — tavla, satranç, sudoku, kelime günü, adam asmaca, hafıza,
          mayın tarlası, 2048 ve daha fazlası.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {NAHABER_GAMES.map((game) => (
          <Link
            key={game.slug}
            href={game.playHref}
            className="group flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm transition hover:border-violet-500/40 hover:shadow-md"
          >
            <div className="flex h-32 items-center justify-center bg-gradient-to-br from-violet-600/20 to-indigo-600/10 text-6xl">
              {game.thumbnailEmoji}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-lg font-bold text-[rgb(var(--color-text))]">{game.title}</h2>
                {game.featured && (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-600">
                    Yeni
                  </span>
                )}
              </div>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
                {game.description}
              </p>
              <span className="inline-flex w-fit items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-violet-700">
                Oyna
              </span>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-[rgb(var(--color-muted))]">
        <Link href={ROUTES.CATEGORY('oyun-espor')} className="underline hover:text-[rgb(var(--color-text))]">
          Oyun &amp; Espor haberleri
        </Link>
        {' · '}
        Geri bildirim için{' '}
        <Link href="/iletisim" className="underline hover:text-[rgb(var(--color-text))]">
          iletişim
        </Link>
      </p>
    </div>
  )
}
