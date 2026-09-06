'use client'

/**
 * Subtle LEFT-swipe discovery hint on Feed cards (V2).
 * pointer-events: none — must never intercept gestures.
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import {
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_ANIM_MS,
  SWIPE_DISCOVERY_CARD_NUDGE_PX,
  SWIPE_DISCOVERY_HINT_MS,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_TRAVEL_PX,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

type Props = {
  active: boolean
  /** Parent reports user is dragging / scrolling — hide immediately. */
  suppressed?: boolean
  /** Subtle card translate (negative = LEFT). Parent applies transform. */
  onCardNudge?: (px: number) => void
}

export function SwipeDiscoveryCoach({ active, suppressed = false, onCardNudge }: Props) {
  const [visible, setVisible] = useState(false)
  const [travel, setTravel] = useState(0)
  const [reduced, setReduced] = useState(false)
  const onCardNudgeRef = useRef(onCardNudge)
  onCardNudgeRef.current = onCardNudge

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    onCardNudgeRef.current?.(0)
    if (!active || suppressed || !shouldShowSwipeDiscoveryCoach()) {
      setVisible(false)
      setTravel(0)
      return
    }

    let cancelled = false
    const timers: number[] = []

    const settle = window.setTimeout(() => {
      if (cancelled) return
      if (!shouldShowSwipeDiscoveryCoach()) return
      recordSwipeDiscoveryShown()
      setVisible(true)

      if (reduced) {
        setTravel(-Math.round(SWIPE_DISCOVERY_TRAVEL_PX * 0.35))
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return
            setVisible(false)
            setTravel(0)
            onCardNudgeRef.current?.(0)
          }, SWIPE_DISCOVERY_HINT_MS)
        )
        return
      }

      setTravel(0)
      onCardNudgeRef.current?.(0)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(-SWIPE_DISCOVERY_TRAVEL_PX)
          onCardNudgeRef.current?.(-SWIPE_DISCOVERY_CARD_NUDGE_PX)
        }, 60)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
          onCardNudgeRef.current?.(0)
        }, 60 + SWIPE_DISCOVERY_ANIM_MS)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setVisible(false)
        }, SWIPE_DISCOVERY_HINT_MS)
      )
    }, SWIPE_DISCOVERY_SETTLE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(settle)
      for (const t of timers) window.clearTimeout(t)
      onCardNudgeRef.current?.(0)
    }
  }, [active, suppressed, reduced])

  useEffect(() => {
    if (suppressed) {
      setVisible(false)
      setTravel(0)
      onCardNudgeRef.current?.(0)
    }
  }, [suppressed])

  if (!visible || !active) return null

  return (
    <div
      data-testid="feed-swipe-discovery-coach"
      data-swipe-discovery-v2="1"
      aria-hidden
      className="pointer-events-none absolute right-3 top-[40%] z-[15] -translate-y-1/2"
      style={{
        transform: `translate3d(${travel}px, -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${SWIPE_DISCOVERY_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <div
        className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-white/95 ring-1 ring-white/15 backdrop-blur-[3px]"
        style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(225,29,46,0.28)' }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px]"
          aria-hidden
        >
          ←
        </span>
        <span>Haberi aç</span>
      </div>
    </div>
  )
}
