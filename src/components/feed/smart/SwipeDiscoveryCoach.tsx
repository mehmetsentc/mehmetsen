'use client'

/**
 * LEFT-swipe discovery hint on Feed cards (V3).
 * pointer-events: none — must never intercept gestures.
 *
 * Must live in the card CHROME stacking layer (not under media), clear of the
 * social rail, or it paints invisibly behind z-10 chrome / z-30 actions.
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import {
  isCoachPaintedInViewport,
  publishSwipeCoachDebug,
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_ANIM_MS,
  SWIPE_DISCOVERY_CARD_NUDGE_PX,
  SWIPE_DISCOVERY_HINT_MS,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_TRAVEL_PX,
  type SwipeDiscoveryPhase,
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
  const [phase, setPhase] = useState<SwipeDiscoveryPhase>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const recordedRef = useRef(false)
  const onCardNudgeRef = useRef(onCardNudge)
  onCardNudgeRef.current = onCardNudge

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    publishSwipeCoachDebug({
      mounted: true,
      eligible: shouldShowSwipeDiscoveryCoach(),
      phase,
    })
  }, [phase, visible, active])

  useEffect(() => {
    onCardNudgeRef.current?.(0)
    recordedRef.current = false
    if (!active || suppressed || !shouldShowSwipeDiscoveryCoach()) {
      setVisible(false)
      setTravel(0)
      setPhase(suppressed ? 'suppressed' : !active ? 'idle' : 'ineligible')
      return
    }

    let cancelled = false
    const timers: number[] = []
    setPhase('waiting')

    const tryRecordVisiblePaint = () => {
      if (cancelled || recordedRef.current) return
      const el = rootRef.current
      if (!isCoachPaintedInViewport(el)) {
        // Retry next frames — layout/stacking may settle after first paint.
        timers.push(
          window.setTimeout(() => {
            requestAnimationFrame(tryRecordVisiblePaint)
          }, 50)
        )
        return
      }
      recordedRef.current = true
      recordSwipeDiscoveryShown()
      publishSwipeCoachDebug({
        mounted: true,
        eligible: true,
        phase: 'visible',
      })
    }

    const runSettleShow = () => {
      if (cancelled) return
      if (!shouldShowSwipeDiscoveryCoach()) {
        setPhase('ineligible')
        return
      }

      setVisible(true)
      setPhase('visible')
      // Count ONLY after a real painted rect intersects the viewport.
      requestAnimationFrame(() => {
        requestAnimationFrame(tryRecordVisiblePaint)
      })

      if (reduced) {
        setTravel(-Math.round(SWIPE_DISCOVERY_TRAVEL_PX * 0.45))
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return
            setVisible(false)
            setTravel(0)
            setPhase('done')
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
          setPhase('animating')
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
          setPhase('done')
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
      setPhase('waiting')
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
      setPhase('suppressed')
      onCardNudgeRef.current?.(0)
    }
  }, [suppressed])

  useEffect(() => {
    return () => {
      publishSwipeCoachDebug({ mounted: false, phase: 'idle' })
    }
  }, [])

  if (!active) return null
  // Keep a mounted sentinel when waiting so TRACE can prove schedule; paint only when visible.
  if (!visible) {
    return (
      <div
        ref={rootRef}
        data-testid="feed-swipe-discovery-coach-slot"
        data-swipe-discovery-phase={phase}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[22]"
      />
    )
  }

  return (
    <div
      ref={rootRef}
      data-testid="feed-swipe-discovery-coach"
      data-swipe-discovery-v3="1"
      data-swipe-discovery-phase={phase}
      aria-hidden
      className="pointer-events-none absolute right-[4.75rem] top-[34%] z-[22] -translate-y-1/2"
      style={{
        transform: `translate3d(${travel}px, -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${SWIPE_DISCOVERY_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`,
        opacity: 1,
      }}
    >
      <div
        className="pointer-events-none flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur-[5px]"
        style={{
          boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(225,29,46,0.4)',
        }}
      >
        <span
          className="relative flex h-5 w-5 shrink-0 items-center justify-center"
          aria-hidden
          data-testid="feed-swipe-discovery-finger"
        >
          <span className="absolute h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(225,29,46,0.65)]" />
        </span>
        <span
          className="flex items-center gap-0.5 text-[13px] font-bold text-white"
          aria-hidden
          data-testid="feed-swipe-discovery-chevrons"
        >
          <span className="text-[#e11d2e]">‹</span>
          <span>‹</span>
          <span className="text-white/75">‹</span>
        </span>
        <span>Haberi aç</span>
      </div>
    </div>
  )
}
