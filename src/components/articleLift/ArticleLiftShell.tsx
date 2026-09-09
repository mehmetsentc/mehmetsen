'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { pauseAllLivingVideo } from '@/lib/livingVideo/activeVideoOwner'
import { clearLiftOrigin, focusLiftOrigin, getCurrentLiftOrigin } from '@/lib/articleLift/liftOrigin'

interface ArticleLiftShellProps {
  articleId: string
  children: React.ReactNode
}

/** Target transition duration — "approximately 250-400ms" per spec. */
const LIFT_TRANSITION_MS = 320

interface FlipTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

/** Computes the FLIP transform that maps a fullscreen box to the given
 * origin card's on-screen rect, so the panel can animate FROM (lift) or
 * TO (return) that exact position/size rather than a generic fade/scale.
 * Returns null if window/document geometry isn't available (SSR) or no
 * origin was recorded — callers must fall back to a generic transition
 * in that case, never fake an origin. */
function computeFlipTransform(origin: { top: number; left: number; width: number; height: number } | null): FlipTransform | null {
  if (!origin || typeof window === 'undefined') return null
  if (origin.width <= 0 || origin.height <= 0) return null
  const targetWidth = window.innerWidth
  const targetHeight = window.innerHeight
  if (targetWidth <= 0 || targetHeight <= 0) return null

  const originCenterX = origin.left + origin.width / 2
  const originCenterY = origin.top + origin.height / 2
  const targetCenterX = targetWidth / 2
  const targetCenterY = targetHeight / 2

  return {
    x: originCenterX - targetCenterX,
    y: originCenterY - targetCenterY,
    scaleX: origin.width / targetWidth,
    scaleY: origin.height / targetHeight,
  }
}

/**
 * LP7R.2 Article Lift chrome. Rendered by the intercepting route
 * (src/app/(main)/@modal/(.)haber/[slug]/page.tsx) as the wrapper around
 * the exact same NewsArticleStatic/NewsArticleInteractive the canonical
 * /haber/[slug] page renders — this component owns ONLY presentation
 * (backdrop, close affordances, animation, focus/scroll management), not
 * article content.
 *
 * IMPORTANT technical note on the exit animation: framer-motion's
 * AnimatePresence `exit` prop does not reliably fire for a Next.js
 * parallel-route unmount (the route change removes this component from
 * the tree on the router's own schedule, not on a local `open` boolean
 * this component controls) - so Article Return is implemented with LOCAL
 * closing state instead: `close()` starts a controlled animation back
 * toward the origin card, and only calls router.back() once that
 * animation completes (or immediately, unanimated, under reduced
 * motion). This is what actually achieves a real ~250-400ms return
 * transition rather than an instant cut.
 */
export function ArticleLiftShell({ articleId, children }: ArticleLiftShellProps) {
  const router = useRouter()
  const shouldReduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closingRef = useRef(false)
  const [isClosing, setIsClosing] = useState(false)

  // Lazy so the very first paint already has the correct FLIP transform -
  // avoids a frame of "wrong" position before an effect could run.
  const [entryTransform] = useState<FlipTransform | null>(() =>
    computeFlipTransform(getCurrentLiftOrigin(articleId))
  )

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setIsClosing(true)

    if (shouldReduceMotion) {
      router.back()
      return
    }

    // Fallback safety: if onAnimationComplete somehow never fires (e.g. the
    // panel unmounts for an unrelated reason), don't leave navigation stuck.
    const fallback = setTimeout(() => router.back(), LIFT_TRANSITION_MS + 150)
    ;(close as unknown as { _fallback?: ReturnType<typeof setTimeout> })._fallback = fallback
  }, [router, shouldReduceMotion])

  const handleAnimationComplete = useCallback(() => {
    if (isClosing) router.back()
  }, [isClosing, router])

  useEffect(() => {
    // Task 8 - Article Lift + Video ownership: never let a background
    // newspaper video keep playing under the lifted article.
    pauseAllLivingVideo()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    closeButtonRef.current?.focus({ preventScroll: true })

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      focusLiftOrigin(articleId)
      clearLiftOrigin()
    }
  }, [articleId, close])

  const exitTransform = isClosing ? computeFlipTransform(getCurrentLiftOrigin(articleId)) ?? entryTransform : null

  const panelMotionProps = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: isClosing ? { opacity: 0 } : { opacity: 1 },
        transition: { duration: 0.12 },
      }
    : {
        initial: entryTransform
          ? { x: entryTransform.x, y: entryTransform.y, scaleX: entryTransform.scaleX, scaleY: entryTransform.scaleY, opacity: 0.4 }
          : { opacity: 0, scale: 0.96 },
        animate: isClosing
          ? exitTransform
            ? { x: exitTransform.x, y: exitTransform.y, scaleX: exitTransform.scaleX, scaleY: exitTransform.scaleY, opacity: 0 }
            : { opacity: 0, scale: 0.96 }
          : { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
        transition: { duration: LIFT_TRANSITION_MS / 1000, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
      }

  return (
    <div className="fixed inset-0 z-modal isolate" role="presentation">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ duration: LIFT_TRANSITION_MS / 1000 }}
        onClick={close}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Haber"
        drag={shouldReduceMotion ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.5}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) close()
        }}
        onAnimationComplete={handleAnimationComplete}
        style={{ transformOrigin: 'center center' }}
        className="absolute inset-0 flex flex-col overflow-hidden bg-[rgb(var(--color-bg))] sm:inset-3 sm:rounded-2xl sm:shadow-2xl md:inset-6 lg:inset-x-[8%] lg:inset-y-6 xl:inset-x-[14%]"
        {...panelMotionProps}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
          <span
            aria-hidden
            className="mx-auto block h-1 w-10 rounded-full bg-[rgb(var(--color-border))] sm:hidden"
          />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Haberi kapat, yayıncı sayfasına dön"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-bg))] hover:text-[rgb(var(--color-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </motion.div>
    </div>
  )
}
