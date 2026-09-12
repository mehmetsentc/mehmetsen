'use client'

import { usePageStateStore } from '@/store/pageStateStore'
import { getLiftReaderOrigin, type LiftReaderOrigin } from '@/lib/articleLift/liftOrigin'

/**
 * Re-pin the captured reader-origin scroll into pageStateStore so
 * PageStateEffects cannot keep a post-overlay footer-scale value
 * (document height) as the /feed restore target.
 */
export function pinLiftReaderOriginToPageState(): LiftReaderOrigin | null {
  const origin = getLiftReaderOrigin()
  if (!origin) return null
  usePageStateStore.getState().setScroll(origin.pathname, origin.scrollY)
  return origin
}

export function applyLiftReaderOriginScroll(
  origin: LiftReaderOrigin,
  setScroll: (path: string, scrollY: number) => void,
  scrollToY: (scrollY: number) => void,
): void {
  setScroll(origin.pathname, origin.scrollY)
  scrollToY(origin.scrollY)
}

export function restoreLiftReaderScroll(): LiftReaderOrigin | null {
  const origin = pinLiftReaderOriginToPageState()
  if (!origin || typeof window === 'undefined') return origin
  window.scrollTo({ top: origin.scrollY, behavior: 'instant' })
  return origin
}

/** Layout-ready restore that wins over PageStateEffects' own double-rAF.
 * Snapshots the origin so a later clearLiftOrigin cannot drop the rAF restore. */
export function restoreLiftReaderScrollAfterLayout(): void {
  const origin = pinLiftReaderOriginToPageState()
  if (!origin || typeof window === 'undefined') return
  const snapshot = { pathname: origin.pathname, scrollY: origin.scrollY }
  const apply = () => {
    applyLiftReaderOriginScroll(
      snapshot,
      (path, scrollY) => usePageStateStore.getState().setScroll(path, scrollY),
      (scrollY) => window.scrollTo({ top: scrollY, behavior: 'instant' }),
    )
  }
  apply()
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(apply)
  })
}
