'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode, TouchEventHandler } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { GameRulesSheet } from '@/components/games/GameRulesSheet'
import { GameLeaderboard } from '@/components/games/GameLeaderboard'

interface GameShellProps {
  /** Oyun slug — kurallar + sıralama */
  gameSlug: string
  title: ReactNode
  subtitle?: ReactNode
  stats?: ReactNode
  children: ReactNode
  className?: string
  dark?: boolean
  backClassName?: string
  hideLeaderboard?: boolean
}

/**
 * Tüm native oyunlar için ortak sayfa kabuğu.
 * Mobil → TV arası ölçeklenir; ilk girişte sade kurallar; üye skor sıralaması.
 * Skor provider sayfa seviyesinde (GameAuthGate içinde) sarıldığı için burada yok.
 */
export function GameShell({
  gameSlug,
  title,
  subtitle,
  stats,
  children,
  className,
  dark,
  backClassName,
  hideLeaderboard,
}: GameShellProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-6xl flex-col',
        'min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 lg:px-8',
        'pb-[max(5rem,calc(var(--safe-bottom,0px)+4.5rem))]',
        className
      )}
    >
      <Link
        href={ROUTES.GAMES}
        className={cn(
          'mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium sm:mb-4',
          dark
            ? 'text-white/60 hover:text-white'
            : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
          backClassName
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Tüm oyunlar
      </Link>

      <header className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-4">
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl',
              !dark && 'text-[rgb(var(--color-text))]'
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                'mt-0.5 text-sm sm:text-base',
                dark ? 'text-white/60' : 'text-[rgb(var(--color-muted))]'
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {stats ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{stats}</div>
        ) : null}
      </header>

      <GameRulesSheet gameSlug={gameSlug} dark={dark} />

      <div className="flex w-full flex-1 flex-col items-stretch">{children}</div>

      {!hideLeaderboard ? <GameLeaderboard gameSlug={gameSlug} dark={dark} /> : null}
    </div>
  )
}

interface GameBoardFrameProps {
  children: ReactNode
  cols: number
  rows: number
  className?: string
  style?: CSSProperties
  onTouchStart?: TouchEventHandler<HTMLDivElement>
  onTouchEnd?: TouchEventHandler<HTMLDivElement>
}

export function GameBoardFrame({
  children,
  cols,
  rows,
  className,
  style,
  onTouchStart,
  onTouchEnd,
}: GameBoardFrameProps) {
  const aspect = cols / Math.max(rows, 1)
  const maxFromHeight = `calc((100dvh - 12rem) * ${aspect.toFixed(4)})`
  const maxCap =
    aspect >= 0.85
      ? 'min(100%, 52rem, 88vmin)'
      : 'min(100%, 34rem, 52vmin)'

  return (
    <div
      className={cn('game-board-frame mx-auto w-full touch-manipulation', className)}
      style={{
        maxWidth: `min(${maxCap}, ${maxFromHeight})`,
        aspectRatio: `${cols} / ${rows}`,
        ...style,
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
