'use client'

/**
 * Subtle LEFT-swipe discovery hint on Feed cards (V2).
 * pointer-events: none — must never intercept gestures.
 *
 * Visual: touch dot + chevrons travel RIGHT → LEFT with "Haberi aç".
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
  const recordedRef = useRef(false)
  const onCardNudgeRef = useRef(onCardNudge)
  onCardNudgeRef.current = onCardNudge

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    onCardNudgeRef.current?.(0)
    recordedRef.current = false
    if (!active || suppressed || !shouldShowSwipeDiscoveryCoach()) {
      setVisible(false)
      setTravel(0)
      return
    }

    let cancelled = false
    const timers: number[] = []

    const runSettleShow = () => {
      if (cancelled) return
      if (!shouldShowSwipeDiscoveryCoach()) return

      setVisible(true)
      // Count a show only after paint — cancelling mid-settle must not burn budget.
      requestAnimationFrame(() => {
        if (cancelled || recordedRef.current) return
        recordedRef.current = true
        recordSwipeDiscoveryShown()
      })

      if (reduced) {
        setTravel(-Math.round(SWIPE_DISCOVERY_TRAVEL_PX * 0.4))
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
        }, 80)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
          onCardNudgeRef.current?.(0)
        }, 80 + SWIPE_DISCOVERY_ANIM_MS)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setVisible(false)
        }, SWIPE_DISCOVERY_HINT_MS)
      )
    }

    const settle = window.setTimeout(runSettleShow, SWIPE_DISCOVERY_SETTLE_MS)

    const onReplay = () => {
      if (!active || suppressed) return
      cancelled = false
      recordedRef.current = false
      for (const t of timers) window.clearTimeout(t)
      timers.length = 0
      runSettleShow()
    }
    window.addEventListener('nahaber-swipe-discovery-replay', onReplay)

    return () => {
      cancelled = true
      window.clearTimeout(settle)
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener('nahaber-swipe-discovery-replay', onReplay)
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
      className="pointer-events-none absolute right-4 top-[38%] z-[18] -translate-y-1/2"
      style={{
        transform: `translate3d(${travel}px, -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${SWIPE_DISCOVERY_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease`,
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="pointer-events-none flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-white/95 ring-1 ring-white/15 backdrop-blur-[4px]"
        style={{
          boxShadow: '0 8px 22px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(225,29,46,0.32)',
        }}
      >
        <span
          className="relative flex h-5 w-5 shrink-0 items-center justify-center"
          aria-hidden
          data-testid="feed-swipe-discovery-finger"
        >
          <span className="absolute h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(225,29,46,0.55)]" />
        </span>
        <span
          className="flex items-center gap-0.5 text-[12px] font-bold text-white"
          aria-hidden
          data-testid="feed-swipe-discovery-chevrons"
        >
          <span className="text-[#e11d2e]">‹</span>
          <span>‹</span>
          <span className="text-white/70">‹</span>
        </span>
        <span>Haberi aç</span>
      </div>
    </div>
  )
}
