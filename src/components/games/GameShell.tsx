'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { CSSProperties, ReactNode, TouchEventHandler } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { GameRulesSheet } from '@/components/games/GameRulesSheet'
import { GameLeaderboard } from '@/components/games/GameLeaderboard'

interface GameShellProps {
  gameSlug: string
  title: ReactNode
  subtitle?: ReactNode
  stats?: ReactNode
  children: ReactNode
  className?: string
  dark?: boolean
  backClassName?: string
  hideLeaderboard?: boolean
  onRestart?: () => void
}

/**
 * Fullscreen game shell covering the entire viewport.
 * Renders a fixed overlay so Navbar / MobileNav are hidden while playing.
 * Top bar: ← Geri dön  |  Title  |  Yeniden başlat
 *
 * Locks body scroll on mount (classic iOS scroll-lock pattern) and blocks
 * all touch-initiated page panning. Game canvas descendants may opt-in to
 * touch-action: manipulation via GameBoardFrame.
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
  onRestart,
}: GameShellProps) {
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    const html = document.documentElement

    const savedBodyStyle = body.style.cssText
    const savedHtmlStyle = html.style.cssText

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    html.style.height = '100%'

    const preventTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.game-board-frame')) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', preventTouchMove, { passive: false })

    return () => {
      document.removeEventListener('touchmove', preventTouchMove)
      body.style.cssText = savedBodyStyle
      html.style.cssText = savedHtmlStyle
      window.scrollTo(0, scrollY)
    }
  }, [])

  const bg = dark ? 'bg-slate-950 text-white' : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
  const barBg = dark ? 'bg-slate-900/90 border-white/10' : 'bg-[rgb(var(--color-card))]/95 border-[rgb(var(--color-border))]'
  const mutedText = dark ? 'text-white/60' : 'text-[rgb(var(--color-muted))]'

  return (
    <div
      ref={shellRef}
      className={cn(
        'fixed inset-0 z-[110] flex flex-col',
        'h-[100dvh] overflow-hidden overscroll-none',
        bg
      )}
      style={{ touchAction: 'none' }}
    >
      {/* ---- Top bar ---- */}
      <header
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 border-b backdrop-blur-md',
          'px-3 sm:px-4',
          'pt-[max(0.5rem,env(safe-area-inset-top))] pb-2',
          barBg
        )}
        style={{ touchAction: 'none' }}
      >
        <Link
          href={ROUTES.GAMES}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors active:scale-95',
            dark
              ? 'text-white/80 hover:bg-white/10 active:bg-white/15'
              : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))] active:bg-[rgb(var(--color-border))]'
          )}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden xs:inline">Geri dön</span>
        </Link>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-base font-black sm:text-lg">{title}</h1>
          {subtitle ? (
            <p className={cn('truncate text-[11px] sm:text-xs', mutedText)}>{subtitle}</p>
          ) : null}
        </div>

        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors active:scale-95',
              dark
                ? 'text-white/80 hover:bg-white/10 active:bg-white/15'
                : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))] active:bg-[rgb(var(--color-border))]'
            )}
            aria-label="Yeniden başlat"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="hidden xs:inline">Yeniden</span>
          </button>
        ) : (
          <div className="w-[68px] shrink-0" />
        )}
      </header>

      {/* ---- Game area (no page scroll, contained overscroll) ---- */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none',
          'px-3 py-2 sm:px-4 sm:py-3',
          'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
          className
        )}
        style={{ touchAction: 'none' }}
      >
        {stats ? (
          <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-end gap-2">{stats}</div>
        ) : null}

        <GameRulesSheet gameSlug={gameSlug} dark={dark} />

        <div className="flex w-full min-h-0 flex-1 flex-col items-stretch">{children}</div>

        {!hideLeaderboard ? <GameLeaderboard gameSlug={gameSlug} dark={dark} /> : null}
      </div>
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
  const maxFromHeight = `calc((100dvh - 10rem) * ${aspect.toFixed(4)})`
  const maxCap =
    aspect >= 0.85
      ? 'min(100%, 52rem, 90vmin)'
      : 'min(100%, 38rem, 60vmin)'

  return (
    <div
      className={cn(
        'game-board-frame mx-auto w-full overscroll-none',
        className
      )}
      style={{
        maxWidth: `min(${maxCap}, ${maxFromHeight})`,
        aspectRatio: `${cols} / ${rows}`,
        touchAction: 'manipulation',
        ...style,
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
