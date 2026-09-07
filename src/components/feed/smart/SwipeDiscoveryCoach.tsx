'use client'

/**
 * LEFT "Haberi Aç" affordance (V6) — visual cue + tappable open authority.
 * Only the chip button receives pointer events (min 44×44).
 * Does NOT cover the card with a transparent overlay.
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
  SWIPE_DISCOVERY_REPEAT_COUNT,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_TRAVEL_PX,
  type SwipeDiscoveryPhase,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

type Props = {
  active: boolean
  suppressed?: boolean
  onCardNudge?: (px: number) => void
  /** Same authority as successful LEFT swipe → openReader. */
  onAffordanceActivate?: () => void
}

export function SwipeDiscoveryCoach({
  active,
  suppressed = false,
  onCardNudge,
  onAffordanceActivate,
}: Props) {
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
      leftCoachVisible: visible,
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
        timers.push(
          window.setTimeout(() => {
            requestAnimationFrame(tryRecordVisiblePaint)
          }, 80)
        )
        return
      }
      recordedRef.current = true
      recordSwipeDiscoveryShown()
      publishSwipeCoachDebug({
        mounted: true,
        eligible: true,
        phase: 'visible',
        leftCoachVisible: true,
      })
    }

    const scheduleTravelCycle = (cycle: number) => {
      if (cancelled || reduced) return
      const base = 80 + cycle * (SWIPE_DISCOVERY_ANIM_MS + 280)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('animating')
          setTravel(-SWIPE_DISCOVERY_TRAVEL_PX)
          onCardNudgeRef.current?.(-SWIPE_DISCOVERY_CARD_NUDGE_PX)
        }, base)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
          onCardNudgeRef.current?.(0)
        }, base + SWIPE_DISCOVERY_ANIM_MS)
      )
    }

    const runSettleShow = () => {
      if (cancelled) return
      if (!shouldShowSwipeDiscoveryCoach()) {
        setPhase('ineligible')
        return
      }

      setVisible(true)
      setPhase('visible')
      requestAnimationFrame(() => {
        requestAnimationFrame(tryRecordVisiblePaint)
      })

      if (reduced) {
        setTravel(-Math.round(SWIPE_DISCOVERY_TRAVEL_PX * 0.45))
        return
      }

      setTravel(0)
      onCardNudgeRef.current?.(0)
      for (let i = 0; i < SWIPE_DISCOVERY_REPEAT_COUNT; i++) scheduleTravelCycle(i)
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
      publishSwipeCoachDebug({ mounted: false, phase: 'idle', leftCoachVisible: false })
    }
  }, [])

  if (!active) return null
  if (!visible) {
    return (
      <div
        ref={rootRef}
        data-testid="feed-swipe-discovery-coach-slot"
        data-swipe-discovery-phase={phase}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[35]"
      />
    )
  }

  return (
    <div
      ref={rootRef}
      data-testid="feed-swipe-discovery-coach"
      data-swipe-discovery-v6="1"
      data-swipe-discovery-phase={phase}
      className="pointer-events-none absolute left-[28%] top-[40%] z-[35] -translate-x-1/2 -translate-y-1/2 max-[820px]:left-1/2"
      style={{
        transform: `translate3d(calc(-50% + ${travel}px), -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${SWIPE_DISCOVERY_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`,
        opacity: 1,
      }}
    >
      <button
        type="button"
        data-testid="feed-swipe-discovery-affordance"
        data-no-reader-gesture="1"
        aria-label="Haberi Aç — sola kaydır veya dokun"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onAffordanceActivate?.()
        }}
        className="pointer-events-auto flex min-h-11 min-w-[11rem] touch-manipulation items-center justify-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-[14px] font-semibold tracking-wide text-white ring-1 ring-white/25 backdrop-blur-[6px] active:scale-[0.98]"
        style={{
          boxShadow: '0 12px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(225,29,46,0.55)',
        }}
      >
        <span
          className="flex items-center gap-0.5 text-[16px] font-bold leading-none text-white"
          aria-hidden
          data-testid="feed-swipe-discovery-chevrons"
        >
          <span className="text-[#e11d2e]">‹</span>
          <span>‹</span>
          <span>‹</span>
        </span>
        <span className="font-bold tracking-[0.04em]">Haberi Aç</span>
        <span
          className="relative ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center"
          aria-hidden
          data-testid="feed-swipe-discovery-finger"
        >
          <span className="absolute h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(225,29,46,0.75)]" />
        </span>
      </button>
    </div>
  )
}
