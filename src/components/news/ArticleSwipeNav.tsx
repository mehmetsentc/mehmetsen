'use client'

/**
 * ArticleSwipeNav
 *
 * Reads nav context saved before entering an article (carousel / feed).
 * - Swipe left  → next article in context
 * - Swipe right → prev article in context
 * - Arrow buttons on sides (visible on all screen sizes)
 *
 * Mounts silently when no context exists (carousel/feed was source).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { readArticleNav, saveArticleNav, type ArticleNavCtx } from '@/lib/articleNavContext'

interface Props {
  /** href of the current article, used to sync index if user navigated via swipe */
  currentHref: string
}

const SWIPE_THRESHOLD = 60  // px minimum horizontal swipe
const SWIPE_ANGLE_MAX = 0.7  // tan(35°) ≈ horizontal bias

export function ArticleSwipeNav({ currentHref }: Props) {
  const router = useRouter()
  const [ctx, setCtx] = useState<ArticleNavCtx | null>(null)
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null)

  // Load context and sync index with current URL
  useEffect(() => {
    const c = readArticleNav()
    if (!c || c.hrefs.length < 2) return

    // Keep index in sync if user navigated article-to-article
    const idx = c.hrefs.indexOf(currentHref)
    if (idx !== -1 && idx !== c.index) {
      const updated = { ...c, index: idx }
      saveArticleNav(updated)
      setCtx(updated)
    } else {
      setCtx(c)
    }
  }, [currentHref])

  const goTo = useCallback(
    (newIndex: number) => {
      if (!ctx) return
      const href = ctx.hrefs[newIndex]
      if (!href) return
      saveArticleNav({ ...ctx, index: newIndex })
      router.push(href)
    },
    [ctx, router],
  )

  // Touch swipe detection
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!ctx || ctx.hrefs.length < 2) return

    const onStart = (e: TouchEvent) => {
      touchStart.current = {
        x: e.touches[0]!.clientX,
        y: e.touches[0]!.clientY,
      }
      setSwipeHint(null)
    }

    const onMove = (e: TouchEvent) => {
      if (!touchStart.current) return
      const dx = e.touches[0]!.clientX - touchStart.current.x
      const dy = e.touches[0]!.clientY - touchStart.current.y
      if (Math.abs(dx) < 12) return
      const isHorizontal = Math.abs(dy / dx) < SWIPE_ANGLE_MAX
      if (!isHorizontal) return
      setSwipeHint(dx < 0 ? 'left' : 'right')
    }

    const onEnd = (e: TouchEvent) => {
      if (!touchStart.current) return
      const dx = e.changedTouches[0]!.clientX - touchStart.current.x
      const dy = e.changedTouches[0]!.clientY - touchStart.current.y
      touchStart.current = null
      setSwipeHint(null)

      const isHorizontal = Math.abs(dy / dx) < SWIPE_ANGLE_MAX
      if (!isHorizontal || Math.abs(dx) < SWIPE_THRESHOLD) return

      if (dx < 0 && ctx.index < ctx.hrefs.length - 1) {
        goTo(ctx.index + 1) // swipe left → next
      } else if (dx > 0 && ctx.index > 0) {
        goTo(ctx.index - 1) // swipe right → prev
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [ctx, goTo])

  if (!ctx || ctx.hrefs.length < 2) return null

  const hasPrev = ctx.index > 0
  const hasNext = ctx.index < ctx.hrefs.length - 1

  const btnBase =
    'fixed top-1/2 z-40 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-all duration-150 active:scale-95 bg-[rgb(var(--color-card))]/80 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))]'

  return (
    <>
      {/* Prev arrow */}
      <button
        type="button"
        aria-label="Önceki haber"
        onClick={() => hasPrev && goTo(ctx.index - 1)}
        className={`${btnBase} left-2 ${hasPrev ? 'opacity-80 hover:opacity-100' : 'pointer-events-none opacity-0'} ${swipeHint === 'right' ? 'scale-110 opacity-100' : ''}`}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {/* Next arrow */}
      <button
        type="button"
        aria-label="Sonraki haber"
        onClick={() => hasNext && goTo(ctx.index + 1)}
        className={`${btnBase} right-2 ${hasNext ? 'opacity-80 hover:opacity-100' : 'pointer-events-none opacity-0'} ${swipeHint === 'left' ? 'scale-110 opacity-100' : ''}`}
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {/* Position indicator */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 z-40 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-[rgb(var(--color-card))]/70 px-3 py-1 backdrop-blur-sm">
          {ctx.hrefs.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Haber ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === ctx.index
                  ? 'w-4 bg-[rgb(var(--color-brand))]'
                  : 'w-1.5 bg-[rgb(var(--color-muted))]/50'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  )
}
