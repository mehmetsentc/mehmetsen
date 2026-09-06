'use client'

/**
 * Subtle LEFT-swipe discovery hint on Feed cards.
 * pointer-events: none — must never intercept gestures.
 */

import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import {
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_HINT_MS,
  SWIPE_DISCOVERY_NUDGE_PX,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

type Props = {
  active: boolean
  /** Parent reports user is dragging / scrolling — hide immediately. */
  suppressed?: boolean
}

export function SwipeDiscoveryCoach({ active, suppressed = false }: Props) {
  const [visible, setVisible] = useState(false)
  const [nudge, setNudge] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    if (!active || suppressed || !shouldShowSwipeDiscoveryCoach()) {
      setVisible(false)
      setNudge(0)
      return
    }
    recordSwipeDiscoveryShown()
    setVisible(true)
    if (!reduced) {
      setNudge(0)
      const t1 = window.setTimeout(() => setNudge(-SWIPE_DISCOVERY_NUDGE_PX), 80)
      const t2 = window.setTimeout(() => setNudge(0), 420)
      const hide = window.setTimeout(() => setVisible(false), SWIPE_DISCOVERY_HINT_MS)
      return () => {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
        window.clearTimeout(hide)
      }
    }
    const hide = window.setTimeout(() => setVisible(false), SWIPE_DISCOVERY_HINT_MS)
    return () => window.clearTimeout(hide)
  }, [active, suppressed, reduced])

  useEffect(() => {
    if (suppressed) {
      setVisible(false)
      setNudge(0)
    }
  }, [suppressed])

  if (!visible || !active) return null

  return (
    <div
      data-testid="feed-swipe-discovery-coach"
      aria-hidden
      className="pointer-events-none absolute right-3 top-[42%] z-[15] -translate-y-1/2"
      style={{
        transform: `translate3d(${nudge}px, -50%, 0)`,
        transition: reduced ? undefined : 'transform 280ms ease',
      }}
    >
      <div className="rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-white/90 ring-1 ring-white/15 backdrop-blur-[2px]">
        ← Kaydır
      </div>
    </div>
  )
}
